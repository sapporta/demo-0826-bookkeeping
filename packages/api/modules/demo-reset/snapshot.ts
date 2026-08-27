/**
 * Publishing a demo snapshot, and restoring a live database to it.
 *
 * Copying the file over is not an option: another process holds it open, and
 * its WAL and shared-memory files belong to that process. So the snapshot is
 * attached instead, and every table's contents are replaced inside one
 * `BEGIN IMMEDIATE` transaction on the connection the server already has.
 * Readers serve the old books until it commits; no restart, no half-state.
 *
 * No table, column, or order is named here. All three are read out of the two
 * databases at restore time, so a migration cannot leave a hand-written list
 * behind, and a snapshot that predates one is refused rather than half
 * restored. Three facts make that safe:
 *
 * - `defer_foreign_keys` holds every check until COMMIT, so deletes and
 *   inserts need no order. It defers `ON DELETE RESTRICT` too, which an
 *   `INITIALLY DEFERRED` declaration would not, and which
 *   `postings.account_id` needs. A restore that would dangle a row still
 *   fails at COMMIT and rolls back whole.
 * - `sqlite_sequence` is an ordinary table, so AUTOINCREMENT counters are
 *   restored with the rows. Without that, `DELETE` leaves each counter at its
 *   high-water mark and ids climb forever across resets.
 * - Unique indexes cannot be deferred, which is why dates move inside the
 *   copy rather than after it. See `date-shift.ts`.
 *
 * Generic: no bookkeeping, no HTTP, nothing to change per app. What is
 * app-specific lives in `app/demo-reset.ts`, which also documents porting.
 */
import { existsSync, renameSync, rmSync } from "node:fs";
import type Database from "better-sqlite3";
import type { ErrorBody } from "@sapporta/shared/contracts";
import {
  planDateShift,
  readAnchor,
  shiftedColumn,
  type DateShiftPlan,
  type DateShiftRequest,
} from "./date-shift.js";

/** The name the snapshot is attached under for the length of one restore. */
const SNAPSHOT = "demo_snapshot";

/**
 * Tables a restore leaves alone: migration bookkeeping only.
 *
 * Everything else is demo data, auth rows included. Holding those back would
 * be worse than pointless — `workspace_id` is the `organization.id` the
 * snapshot was taken beside, so keeping live auth rows while restoring the
 * data orphans every row without raising an error.
 */
export const DEFAULT_HELD_TABLES = ["__drizzle_migrations"] as const;

export interface RestoreOptions {
  snapshotPath: string;
  heldTables?: readonly string[];
  /** Left out, dates are restored exactly as captured. */
  dates?: DateShiftRequest;
  /**
   * Tables a usable snapshot has rows in. A snapshot missing any of them is
   * refused: restoring one would empty the live database of the rows the
   * deployment needs to answer a request at all, and it would commit cleanly,
   * because emptying everything breaks no foreign key.
   */
  requiredTables?: readonly string[];
}

export interface RestoreResult {
  /** Rows restored, by table name. */
  tables: Record<string, number>;
  rows: number;
  shift: DateShiftPlan | null;
  /** How long the transaction held the write lock. */
  durationMs: number;
}

/** A restore that could not start. Both causes are deployment faults. */
export abstract class SnapshotError extends Error {
  abstract readonly payload: ErrorBody;
}

export class SnapshotMissingError extends SnapshotError {
  readonly payload: ErrorBody;

  constructor(readonly snapshotPath: string) {
    super(`No demo snapshot at ${snapshotPath}.`);
    this.name = "SnapshotMissingError";
    this.payload = {
      error: "This deployment has no demo snapshot to restore.",
      code: "DEMO_SNAPSHOT_MISSING",
    };
  }
}

/** A snapshot captured before the database was seeded, most likely. */
export class SnapshotEmptyError extends SnapshotError {
  readonly payload: ErrorBody;

  constructor(readonly emptyTables: readonly string[]) {
    super(`Demo snapshot has no rows in ${emptyTables.join(", ")}.`);
    this.name = "SnapshotEmptyError";
    this.payload = {
      error: `The demo snapshot has no rows in ${emptyTables.join(", ")}, so restoring it would leave this deployment with nothing to serve.`,
      code: "DEMO_SNAPSHOT_EMPTY",
      details: [...emptyTables],
    };
  }
}

/** Almost always a deploy that migrated without republishing the snapshot. */
export class SnapshotSchemaMismatchError extends SnapshotError {
  readonly payload: ErrorBody;

  constructor(readonly differences: readonly string[]) {
    super(`Demo snapshot does not match this schema: ${differences.join("; ")}.`);
    this.name = "SnapshotSchemaMismatchError";
    this.payload = {
      error: `The demo snapshot was taken against a different schema: ${differences.join("; ")}.`,
      code: "DEMO_SNAPSHOT_SCHEMA_MISMATCH",
      details: [...differences],
    };
  }
}

/** One table to replace, with the columns to carry across. */
interface TableRestore {
  name: string;
  /** Quoted column list the INSERT writes. */
  columns: string;
  /** The matching SELECT list, with any dated column already moved. */
  select: string;
}

/**
 * `clear` is the case worth naming: a snapshot captured with its tables empty
 * has no counters of its own, and ids should start over rather than carry on
 * from wherever a visitor left them.
 */
type SequenceRestore = "none" | "clear" | "restore";

interface RestorePlan {
  tables: readonly TableRestore[];
  sequence: SequenceRestore;
  /** Where the dates end up, decided from the snapshot before any lock. */
  shift: DateShiftPlan | null;
}

/**
 * Restores every table in `sqlite` to its contents in the snapshot.
 *
 * Synchronous end to end, so two requests cannot interleave inside it and the
 * attached snapshot is never visible to another handler.
 */
export function restoreFromSnapshot(
  sqlite: Database.Database,
  options: RestoreOptions,
): RestoreResult {
  const { snapshotPath, heldTables = DEFAULT_HELD_TABLES } = options;
  // Attaching a file that is not there creates an empty database, which would
  // read as "every table is missing" rather than as the misconfiguration it is.
  if (!existsSync(snapshotPath)) throw new SnapshotMissingError(snapshotPath);

  // ATTACH cannot run inside a transaction, so the snapshot is opened first
  // and the plan is built before any lock is taken.
  sqlite.prepare(`ATTACH DATABASE ? AS ${SNAPSHOT}`).run(snapshotPath);
  try {
    const plan = planRestore(sqlite, heldTables, options.dates, options.requiredTables ?? []);
    const started = performance.now();
    const tables = sqlite.transaction(() => applyRestore(sqlite, plan)).immediate();
    const durationMs = performance.now() - started;
    // Each reset rewrites the whole dataset into the WAL; unchecked, four an
    // hour grow one that dwarfs the database.
    sqlite.pragma("wal_checkpoint(TRUNCATE)");
    const rows = Object.values(tables).reduce((total, n) => total + n, 0);
    return { tables, rows, shift: plan.shift, durationMs };
  } finally {
    sqlite.exec(`DETACH DATABASE ${SNAPSHOT}`);
  }
}

/**
 * Publishes `sqlite`'s contents as the snapshot at `snapshotPath`.
 *
 * `VACUUM INTO` is safe against a live database — no lock is held for the
 * length of the copy — and lands one defragmented file with no WAL beside it.
 * Staged and renamed, so a concurrent restore attaches one snapshot or the
 * other, never a partial file.
 */
export function captureSnapshot(
  sqlite: Database.Database,
  snapshotPath: string,
): void {
  const staging = `${snapshotPath}.staging`;
  // VACUUM INTO refuses to write over an existing file.
  rmSync(staging, { force: true });
  sqlite.prepare("VACUUM INTO ?").run(staging);
  renameSync(staging, snapshotPath);
}

/**
 * Decides everything before the transaction opens, so a mismatch cannot empty
 * half the tables before failing on the one that changed.
 */
function planRestore(
  sqlite: Database.Database,
  heldTables: readonly string[],
  dates: DateShiftRequest | undefined,
  required: readonly string[],
): RestorePlan {
  const live = tablesIn(sqlite, "main", heldTables);
  const snapshot = tablesIn(sqlite, SNAPSHOT, heldTables);
  const differences = [
    ...missingFrom("the snapshot", live, snapshot),
    ...missingFrom("this database", snapshot, live),
  ];
  if (differences.length > 0) throw new SnapshotSchemaMismatchError(differences);

  const shift = dates
    ? planDateShift(dates, readAnchor(sqlite, SNAPSHOT, dates.columns))
    : null;

  const tables: TableRestore[] = [];
  for (const table of live) {
    const liveColumns = columnsIn(sqlite, "main", table.name);
    const snapshotColumns = columnsIn(sqlite, SNAPSHOT, table.name);
    const difference = columnDifference(liveColumns, snapshotColumns);
    if (difference) differences.push(`${table.name} ${difference}`);
    // A virtual table holds no rows of its own: its contents live in the
    // shadow tables beside it, which restore like anything else.
    if (!table.virtual) {
      tables.push({
        name: table.name,
        columns: liveColumns.map(quoteName).join(", "),
        select: liveColumns
          .map(
            (column) =>
              shiftedColumn(shift, table.name, column) ?? quoteName(column),
          )
          .join(", "),
      });
    }
  }
  // A shift column that stopped existing gets the same refusal: a demo that
  // quietly stopped moving its dates just looks like a demo full of old data.
  for (const { table, column } of dates?.columns ?? []) {
    const known = tables.some((restore) => restore.name === table);
    if (!known || !columnsIn(sqlite, "main", table).includes(column)) {
      differences.push(`${table}.${column} is named for the date shift but is not a column`);
    }
  }
  if (differences.length > 0) throw new SnapshotSchemaMismatchError(differences);

  const empty = tablesWithoutRows(sqlite, SNAPSHOT, required);
  if (empty.length > 0) throw new SnapshotEmptyError(empty);

  return { tables, sequence: planSequence(sqlite), shift };
}

/** Empties every table and refills it. Order does not matter; see the header. */
function applyRestore(
  sqlite: Database.Database,
  plan: RestorePlan,
): Record<string, number> {
  // Inside the transaction by necessity: SQLite clears it at COMMIT, and
  // `foreign_keys` itself cannot be changed mid-transaction.
  sqlite.pragma("defer_foreign_keys = ON");

  for (const table of plan.tables) {
    sqlite.prepare(`DELETE FROM main.${quoteName(table.name)}`).run();
  }

  const restored: Record<string, number> = {};
  for (const { name, columns, select } of plan.tables) {
    const inserted = sqlite
      .prepare(
        `INSERT INTO main.${quoteName(name)} (${columns})
         SELECT ${select} FROM ${SNAPSHOT}.${quoteName(name)}`,
      )
      .run();
    restored[name] = inserted.changes;
  }

  if (plan.sequence !== "none" && plan.tables.length > 0) {
    // Named one by one: a held-out table's counter is not ours to rewind.
    const names = plan.tables.map((table) => table.name);
    const list = names.map(() => "?").join(", ");
    sqlite
      .prepare(`DELETE FROM main.sqlite_sequence WHERE name IN (${list})`)
      .run(...names);
    if (plan.sequence === "restore") {
      sqlite
        .prepare(
          `INSERT INTO main.sqlite_sequence (name, seq)
           SELECT name, seq FROM ${SNAPSHOT}.sqlite_sequence WHERE name IN (${list})`,
        )
        .run(...names);
    }
  }

  return restored;
}

interface TableRow {
  name: string;
  virtual: boolean;
}

/** Every table a restore is concerned with, in one database. */
function tablesIn(
  sqlite: Database.Database,
  schema: string,
  heldTables: readonly string[],
): TableRow[] {
  // `schema` is one of this module's two constants, never caller input.
  const rows = sqlite
    .prepare(
      `SELECT name, sql FROM ${schema}.sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'
        ORDER BY name`,
    )
    .all() as { name: string; sql: string | null }[];
  return rows
    .filter((row) => !heldTables.includes(row.name))
    .map((row) => ({
      name: row.name,
      virtual: /^\s*create\s+virtual\s+table/i.test(row.sql ?? ""),
    }));
}

function columnsIn(
  sqlite: Database.Database,
  schema: string,
  table: string,
): string[] {
  const rows = sqlite
    .prepare("SELECT name FROM pragma_table_info(?, ?)")
    .all(table, schema) as { name: string }[];
  return rows.map((row) => row.name);
}

function missingFrom(
  where: string,
  expected: readonly TableRow[],
  found: readonly TableRow[],
): string[] {
  const names = new Set(found.map((table) => table.name));
  return expected
    .filter((table) => !names.has(table.name))
    .map((table) => `${table.name} is not in ${where}`);
}

/** Compared as sets: both sides of the copy name their columns, so a
 *  migration that reorders them is not worth refusing over. */
function columnDifference(live: string[], snapshot: string[]): string | null {
  const inSnapshot = new Set(snapshot);
  const inLive = new Set(live);
  const onlyLive = live.filter((column) => !inSnapshot.has(column));
  const onlySnapshot = snapshot.filter((column) => !inLive.has(column));
  if (onlyLive.length === 0 && onlySnapshot.length === 0) return null;
  return [
    onlyLive.length > 0 ? `has ${onlyLive.join(", ")} the snapshot does not` : "",
    onlySnapshot.length > 0
      ? `is missing ${onlySnapshot.join(", ")} the snapshot has`
      : "",
  ]
    .filter(Boolean)
    .join(" and ");
}

function planSequence(sqlite: Database.Database): SequenceRestore {
  if (!hasSequence(sqlite, "main")) return "none";
  return hasSequence(sqlite, SNAPSHOT) ? "restore" : "clear";
}

function hasSequence(sqlite: Database.Database, schema: string): boolean {
  // Present only once some table there has used AUTOINCREMENT.
  const found = sqlite
    .prepare(
      `SELECT 1 FROM ${schema}.sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'`,
    )
    .get();
  return found !== undefined;
}

/**
 * Which of these tables hold no rows, counting one that does not exist.
 *
 * Asked of the snapshot, it decides whether restoring is worth refusing.
 * Asked of the live database, it decides whether a deployment has any demo
 * data at all — which is how a fresh volume knows to restore itself at boot.
 */
export function tablesWithoutRows(
  sqlite: Database.Database,
  schema: string,
  tables: readonly string[],
): string[] {
  return tables.filter((table) => {
    const found = sqlite
      .prepare(
        `SELECT 1 FROM ${schema}.sqlite_master WHERE type = 'table' AND name = ?`,
      )
      .get(table);
    if (!found) return true;
    return (
      sqlite
        .prepare(`SELECT 1 FROM ${schema}.${quoteName(table)} LIMIT 1`)
        .get() === undefined
    );
  });
}

/** For names read back out of `sqlite_master`. */
function quoteName(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}
