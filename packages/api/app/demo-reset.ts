/**
 * `POST /api/demo-reset` — restores every table from the snapshot at
 * `SAPPORTA_DEMO_SNAPSHOT` and brings its dates up to today. No body: a caller
 * chooses nothing, so the route can only undo what visitors have done.
 *
 * Mounted only where that setting names a file, so it does not exist on a
 * deployment holding real data. It has no credential of its own: on a demo,
 * `SAPPORTA_DEMO_USER_EMAIL` already serves uncredentialed requests as the demo
 * account, so a scheduler needs nothing; anywhere else the caller must present
 * one. A second way to authenticate is a second way to get it wrong.
 *
 * ==========================================================================
 * PORTING THIS TO ANOTHER DEMO APP
 *
 * This file holds everything app-specific. `modules/demo-reset/` is generic
 * and copies across unchanged. In order of how easy each is to get wrong:
 *
 * 1. MONTH_COLUMNS below — every column keying a period rather than a day.
 *    Day columns find themselves; these cannot. Wrong here is the only
 *    failure that stays invisible: one report quietly goes stale.
 * 2. REQUIRED_TABLES below — the tables without which the app cannot serve a
 *    request. Empty in the live database means a fresh volume, and boot
 *    restores; empty in a snapshot means that snapshot is refused.
 * 3. `can("run", "demo_reset")` in `authz/ability.ts`.
 * 4. The two blocks in `boot.ts` and `app.ts` that read the settings, restore
 *    at boot, and mount the route. The catalog passed there is what makes day
 *    columns self-declaring.
 * 5. `DEFAULT_HELD_TABLES` in `modules/demo-reset/snapshot.ts`, only if some
 *    table's rows must survive a reset. Migration bookkeeping is already held;
 *    everything else is demo data, auth rows included.
 *
 * Two limits to check against the new schema rather than change:
 * - `timestamp` columns are not moved. They carry a time, so they need SQL of
 *   their own; a demo whose story is told by `created_at` needs a third unit
 *   in `date-shift.ts`.
 * - The anchor is the newest date in the snapshot, so an app that ships
 *   deliberately future-dated rows needs a different rule.
 * ==========================================================================
 */
import { resolve } from "node:path";
import type Database from "better-sqlite3";
import { TsRestApi, type SapportaEnv, type TableCatalog } from "@sapporta/server";
import { Temporal } from "@sapporta/shared/temporal";
import { demoResetContract } from "bookkeeping-shared";
import type { ShiftColumn } from "../modules/demo-reset/date-shift.js";
import {
  restoreFromSnapshot,
  SnapshotError,
  tablesWithoutRows,
  type RestoreOptions,
  type RestoreResult,
} from "../modules/demo-reset/snapshot.js";
import { requireAuthorizedSystemData } from "../project-auth/index.js";

const RUN_DEMO_RESET = { action: "run", subject: "demo_reset" } as const;

/**
 * Columns holding a period rather than a day, moved by whole months.
 *
 * `budgets.month` is `YYYY-MM` text: a budget is *for* July, so nudging it by
 * 24 days would leave it between two months. The schema stamps no kind on it,
 * so nothing can infer it. A name here that stops existing fails the next
 * reset loudly.
 */
const MONTH_COLUMNS = [
  { table: "budgets", column: "month", unit: "month" },
] as const satisfies readonly ShiftColumn[];

/**
 * Tables this app cannot answer a request without.
 *
 * `user` is the one that bites: `SAPPORTA_DEMO_USER_EMAIL` is resolved per
 * request, so a database without that row fails in auth middleware, before any
 * route — including this one. A demo that restored a snapshot missing it could
 * not restore its way back out.
 */
const REQUIRED_TABLES = ["user", "transactions"] as const;

/** Day columns, from the schema: `date()` stamps them, so migrations carry. */
function dayColumns(catalog: TableCatalog): ShiftColumn[] {
  return catalog.tables.flatMap((table) =>
    Object.entries(table.meta?.columns ?? {})
      .filter(([, column]) => column?.kind === "date")
      .map(([column]) => ({ table: table.sqlName, column, unit: "day" as const })),
  );
}

export interface DemoResetSettings {
  snapshotPath: string;
}

/**
 * Null where the deployment has no snapshot and the route should not exist.
 *
 * A relative path is read from the project root. In a container it should sit
 * outside the data volume: the snapshot belongs to the image, not to the
 * database that outlives it.
 */
export function readDemoResetSettings(
  env: NodeJS.ProcessEnv,
  projectRoot: string,
): DemoResetSettings | null {
  const configured = env.SAPPORTA_DEMO_SNAPSHOT?.trim();
  if (!configured) return null;
  return { snapshotPath: resolve(projectRoot, configured) };
}

export interface DemoResetDeps {
  catalog: TableCatalog;
  /** Injected so a test can hold today still. */
  today: () => Temporal.PlainDate;
}

function restoreOptions(
  settings: DemoResetSettings,
  { catalog, today }: DemoResetDeps,
): RestoreOptions {
  return {
    ...settings,
    requiredTables: REQUIRED_TABLES,
    dates: { today: today(), columns: [...dayColumns(catalog), ...MONTH_COLUMNS] },
  };
}

/**
 * Fills an empty database from the snapshot, for `boot.ts` to call before the
 * server listens. Null when there is nothing to do.
 *
 * A fresh volume has its migrations and no rows, and a demo cannot serve a
 * request without its account, so without this a new deployment answers every
 * request with an error and cannot be reset out of it — the reset route is
 * behind the same middleware that fails. A restart with data present finds
 * every required table populated and leaves the books alone.
 *
 * Faults are thrown rather than logged: naming a snapshot is a deployment
 * saying its data comes from that file, and one that cannot be read leaves a
 * demo with nothing to serve. Failing at boot says so once, where an operator
 * is looking, instead of once per request.
 */
export function restoreDemoSnapshotIfEmpty(
  sqlite: Database.Database,
  settings: DemoResetSettings | null,
  deps: DemoResetDeps,
): RestoreResult | null {
  if (!settings) return null;
  if (tablesWithoutRows(sqlite, "main", REQUIRED_TABLES).length === 0) return null;
  return restoreFromSnapshot(sqlite, restoreOptions(settings, deps));
}

export function createDemoResetApi(
  settings: DemoResetSettings,
  deps: DemoResetDeps,
): TsRestApi<SapportaEnv> {
  const api = new TsRestApi<SapportaEnv>();
  api.register("demoReset", demoResetContract.demoReset, ({ c }) => {
    requireAuthorizedSystemData(c, RUN_DEMO_RESET);
    try {
      // The server's own handle, so this is one transaction on the connection
      // already serving requests rather than a second writer.
      const restored = restoreFromSnapshot(
        c.get("sqlite"),
        restoreOptions(settings, deps),
      );
      return {
        status: 200,
        body: {
          tables: restored.tables,
          rows: restored.rows,
          shift: restored.shift
            ? {
                anchor: restored.shift.anchor,
                days: restored.shift.days,
                months: restored.shift.months,
              }
            : null,
          duration_ms: Math.round(restored.durationMs),
        },
      };
    } catch (error) {
      if (!(error instanceof SnapshotError)) throw error;
      return { status: 503, body: error.payload };
    }
  });
  return api;
}
