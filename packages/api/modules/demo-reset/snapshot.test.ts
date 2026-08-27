import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { Temporal } from "@sapporta/shared/temporal";
import {
  captureSnapshot,
  restoreFromSnapshot,
  SnapshotEmptyError,
  SnapshotMissingError,
  SnapshotSchemaMismatchError,
  tablesWithoutRows,
} from "./snapshot.js";

const workspaces: string[] = [];

afterEach(() => {
  for (const dir of workspaces.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** `ON DELETE RESTRICT`, and `parents` sorts before `children`: the restore
 *  empties the parent first, which only a deferred check survives. */
function openBooks(): { sqlite: Database.Database; snapshotPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "demo-reset-"));
  workspaces.push(dir);
  const sqlite = new Database(join(dir, "live.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE parents (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE children (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER NOT NULL REFERENCES parents(id) ON DELETE RESTRICT,
      note TEXT
    );
    INSERT INTO parents (name) VALUES ('first'), ('second');
    INSERT INTO children (parent_id, note) VALUES (1, 'kept'), (2, 'kept too');
  `);
  return { sqlite, snapshotPath: join(dir, "snapshot.db") };
}

describe("restoreFromSnapshot", () => {
  it("restores every table without being told the order to do it in", () => {
    const { sqlite, snapshotPath } = openBooks();
    captureSnapshot(sqlite, snapshotPath);

    sqlite.exec("DELETE FROM children; DELETE FROM parents");
    sqlite.exec("INSERT INTO parents (name) VALUES ('a visitor')");

    const result = restoreFromSnapshot(sqlite, { snapshotPath });

    expect(result.tables).toEqual({ parents: 2, children: 2 });
    expect(result.rows).toBe(4);
    expect(sqlite.prepare("SELECT name FROM parents ORDER BY id").all()).toEqual([
      { name: "first" },
      { name: "second" },
    ]);
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
  });

  it("rewinds AUTOINCREMENT so ids do not climb across resets", () => {
    const { sqlite, snapshotPath } = openBooks();
    captureSnapshot(sqlite, snapshotPath);

    const addChild = () => {
      sqlite.prepare("INSERT INTO children (parent_id, note) VALUES (1, 'added')").run();
      return sqlite.prepare("SELECT max(id) AS id FROM children").get() as { id: number };
    };

    expect(addChild().id).toBe(3);
    restoreFromSnapshot(sqlite, { snapshotPath });
    expect(addChild().id).toBe(3);
    restoreFromSnapshot(sqlite, { snapshotPath });
    expect(addChild().id).toBe(3);
  });

  it("leaves the books alone when the restore would break a foreign key", () => {
    const { sqlite, snapshotPath } = openBooks();
    captureSnapshot(sqlite, snapshotPath);
    // A held-out table left holding a child whose parent the snapshot lacks.
    sqlite.exec("INSERT INTO parents (name) VALUES ('third')");
    sqlite.exec("INSERT INTO children (parent_id, note) VALUES (3, 'orphan')");

    expect(() =>
      restoreFromSnapshot(sqlite, { snapshotPath, heldTables: ["children"] }),
    ).toThrow(/FOREIGN KEY/i);
    expect(sqlite.prepare("SELECT count(*) AS n FROM parents").get()).toEqual({ n: 3 });
    expect(sqlite.prepare("SELECT count(*) AS n FROM children").get()).toEqual({ n: 3 });
  });

  it("refuses a snapshot taken against a different schema", () => {
    const { sqlite, snapshotPath } = openBooks();
    captureSnapshot(sqlite, snapshotPath);
    sqlite.exec("ALTER TABLE parents ADD COLUMN nickname TEXT");
    sqlite.exec("CREATE TABLE pets (id INTEGER PRIMARY KEY)");

    expect(() => restoreFromSnapshot(sqlite, { snapshotPath })).toThrow(
      SnapshotSchemaMismatchError,
    );
    // Refused before anything was emptied.
    expect(sqlite.prepare("SELECT count(*) AS n FROM parents").get()).toEqual({ n: 2 });
  });

  it("names the missing file rather than restoring an empty database", () => {
    const { sqlite, snapshotPath } = openBooks();
    expect(() => restoreFromSnapshot(sqlite, { snapshotPath })).toThrow(
      SnapshotMissingError,
    );
    expect(sqlite.prepare("SELECT count(*) AS n FROM parents").get()).toEqual({ n: 2 });
  });

  it("refuses a snapshot with no rows in a table the app cannot serve without", () => {
    const { sqlite, snapshotPath } = openBooks();
    sqlite.exec("DELETE FROM children");
    captureSnapshot(sqlite, snapshotPath);
    sqlite.exec("INSERT INTO children (parent_id, note) VALUES (1, 'live')");

    expect(() =>
      restoreFromSnapshot(sqlite, { snapshotPath, requiredTables: ["children"] }),
    ).toThrow(SnapshotEmptyError);
    // Refused before anything was emptied, so the demo still has its data.
    expect(sqlite.prepare("SELECT count(*) AS n FROM children").get()).toEqual({ n: 1 });
  });

  it("reports which required tables are empty, counting one that is absent", () => {
    const { sqlite } = openBooks();
    expect(tablesWithoutRows(sqlite, "main", ["parents", "children"])).toEqual([]);
    sqlite.exec("DELETE FROM children");
    expect(tablesWithoutRows(sqlite, "main", ["parents", "children", "gone"])).toEqual([
      "children",
      "gone",
    ]);
  });

  it("starts ids over when the snapshot was taken with the tables empty", () => {
    const { sqlite, snapshotPath } = openBooks();
    sqlite.exec("DELETE FROM children; DELETE FROM parents; DELETE FROM sqlite_sequence");
    captureSnapshot(sqlite, snapshotPath);

    sqlite.exec("INSERT INTO parents (name) VALUES ('a visitor')");
    expect(sqlite.prepare("SELECT max(id) AS id FROM parents").get()).toEqual({ id: 1 });

    restoreFromSnapshot(sqlite, { snapshotPath });
    sqlite.exec("INSERT INTO parents (name) VALUES ('after the reset')");
    expect(sqlite.prepare("SELECT max(id) AS id FROM parents").get()).toEqual({ id: 1 });
  });
});

describe("bringing a snapshot up to date", () => {
  /** Books like this app's: dated entries, and budgets keyed by month. */
  function openDatedBooks(): { sqlite: Database.Database; snapshotPath: string } {
    const dir = mkdtempSync(join(tmpdir(), "demo-reset-dates-"));
    workspaces.push(dir);
    const sqlite = new Database(join(dir, "live.db"));
    sqlite.exec(`
      CREATE TABLE entries (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL);
      CREATE TABLE budgets (id INTEGER PRIMARY KEY AUTOINCREMENT, month TEXT NOT NULL);
      INSERT INTO entries (date) VALUES ('2026-01-01'), ('2026-07-31'), ('2026-08-25');
      INSERT INTO budgets (month) VALUES ('2026-01'), ('2026-07'), ('2026-08');
    `);
    return { sqlite, snapshotPath: join(dir, "snapshot.db") };
  }

  const dates = (today: string) => ({
    today: Temporal.PlainDate.from(today),
    columns: [
      { table: "entries", column: "date", unit: "day" as const },
      { table: "budgets", column: "month", unit: "month" as const },
    ],
  });

  const read = (sqlite: Database.Database, sql: string) =>
    sqlite.prepare(sql).all().map((row) => Object.values(row as object)[0]);

  it("lands the newest entry on today and moves the months with it", () => {
    const { sqlite, snapshotPath } = openDatedBooks();
    captureSnapshot(sqlite, snapshotPath);

    const result = restoreFromSnapshot(sqlite, {
      snapshotPath,
      dates: dates("2026-11-15"),
    });

    expect(result.shift).toMatchObject({ anchor: "2026-08-25", days: 82, months: 3 });
    expect(read(sqlite, "SELECT date FROM entries ORDER BY id")).toEqual([
      "2026-03-24",
      "2026-10-21",
      "2026-11-15",
    ]);
    expect(read(sqlite, "SELECT month FROM budgets ORDER BY id")).toEqual([
      "2026-04",
      "2026-10",
      "2026-11",
    ]);
  });

  it("keeps a budget for the month the newest entry lands in", () => {
    const { sqlite, snapshotPath } = openDatedBooks();
    captureSnapshot(sqlite, snapshotPath);

    // Today's day of the month is before the anchor's: the case that pulls
    // day columns back across a month boundary.
    restoreFromSnapshot(sqlite, { snapshotPath, dates: dates("2027-02-03") });

    const newest = read(sqlite, "SELECT max(date) FROM entries")[0] as string;
    const budgets = read(sqlite, "SELECT month FROM budgets");
    expect(newest).toBe("2027-02-03");
    expect(budgets).toContain(newest.slice(0, 7));
  });

  it("moves a month inside a unique index onto its own old values", () => {
    // Source and target overlap, so an in-place UPDATE would collide with
    // rows that had not moved yet.
    const { sqlite, snapshotPath } = openDatedBooks();
    sqlite.exec("CREATE UNIQUE INDEX budgets_month_idx ON budgets (month)");
    sqlite.exec("INSERT INTO budgets (month) VALUES ('2026-02'), ('2026-03')");
    captureSnapshot(sqlite, snapshotPath);

    restoreFromSnapshot(sqlite, { snapshotPath, dates: dates("2027-02-25") });

    expect(read(sqlite, "SELECT month FROM budgets ORDER BY id")).toEqual([
      "2026-07",
      "2027-01",
      "2027-02",
      "2026-08",
      "2026-09",
    ]);
  });

  it("refuses a column named for the shift that is not on the table", () => {
    const { sqlite, snapshotPath } = openDatedBooks();
    captureSnapshot(sqlite, snapshotPath);

    expect(() =>
      restoreFromSnapshot(sqlite, {
        snapshotPath,
        dates: {
          today: Temporal.PlainDate.from("2026-11-15"),
          columns: [{ table: "budgets", column: "moonth", unit: "month" }],
        },
      }),
    ).toThrow(/moonth/);
  });
});
