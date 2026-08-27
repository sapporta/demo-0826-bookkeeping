/**
 * Moving a snapshot's dates forward so a restore produces current books
 * rather than the books of whenever the snapshot was taken.
 *
 * The anchor is the newest date in the snapshot; after the shift it is today.
 * The distance is measured twice, and that is the whole subtlety here. A
 * column holding a day moves by whole days, so nothing lands after today. A
 * column holding a period moves by whole months, because a column keyed by
 * month has to keep landing on months.
 *
 * The two measurements agree except at the oldest edge: when today's day of
 * the month falls before the anchor's, the oldest days slide back across a
 * boundary the month columns did not cross, and the oldest month can hold
 * entries whose month-keyed row now sits a month later. That costs the oldest
 * month of a demo. Moving everything by whole months instead would cost a
 * ledger dated three weeks from now.
 *
 * Nothing here is app-specific; `app/demo-reset.ts` names the columns.
 */
import { Temporal } from "@sapporta/shared/temporal";
import type Database from "better-sqlite3";

export interface ShiftColumn {
  table: string;
  column: string;
  /** `day` for a `YYYY-MM-DD` column, `month` for a `YYYY-MM` one. */
  unit: "day" | "month";
}

export interface DateShiftRequest {
  today: Temporal.PlainDate;
  columns: readonly ShiftColumn[];
}

export interface DateShiftPlan {
  /** The snapshot's newest date, which the shift moves onto today. */
  anchor: string;
  days: number;
  months: number;
  columns: readonly ShiftColumn[];
}

/**
 * Null when there is nothing to anchor to, or when the snapshot is already
 * current. Books only ever move forward, so a clock that disagrees cannot
 * walk the demo's history backwards a little on every reset.
 */
export function planDateShift(
  request: DateShiftRequest,
  anchor: string | null,
): DateShiftPlan | null {
  if (anchor === null) return null;
  const from = Temporal.PlainDate.from(anchor);
  if (Temporal.PlainDate.compare(from, request.today) >= 0) return null;
  return {
    anchor,
    days: from.until(request.today, { largestUnit: "day" }).days,
    months: from
      .toPlainYearMonth()
      .until(request.today.toPlainYearMonth(), { largestUnit: "month" }).months,
    columns: request.columns,
  };
}

/**
 * How one column is read out of the snapshot, moved — or null to copy it as
 * it is.
 *
 * An expression rather than an `UPDATE` over the restored rows, and that is
 * correctness rather than economy. A column inside a unique index cannot be
 * moved in place: the months of one account are unique, moving
 * `2025-07..2026-02` forward six months targets `2026-01..2026-08`, and those
 * ranges overlap, so a row lands on a value a row that has not moved yet
 * still holds. SQLite checks a unique index per row and will not defer it the
 * way it defers a foreign key. Moving values as they are copied has no such
 * intermediate state: the table is empty, and what arrives is unique because
 * what it came from was.
 *
 * `strftime` reads a `YYYY-MM` column as its first day, which exists in every
 * month and so cannot overflow the way adding a month to the 31st does. Both
 * functions answer NULL for a value they cannot read, so a column holding
 * something that is not a date fails NOT NULL and takes the restore down with
 * it rather than quietly emptying a column.
 */
export function shiftedColumn(
  plan: DateShiftPlan | null,
  table: string,
  column: string,
): string | null {
  const shift = plan?.columns.find(
    (candidate) => candidate.table === table && candidate.column === column,
  );
  if (!plan || !shift) return null;
  const distance = shift.unit === "day" ? plan.days : plan.months;
  if (distance === 0) return null;
  // Interpolated from a count this module measured, never from caller input.
  const modifier = `'+${distance} ${shift.unit}s'`;
  const name = quoteName(column);
  return shift.unit === "day"
    ? `date(${name}, ${modifier})`
    : `strftime('%Y-%m', ${name} || '-01', ${modifier})`;
}

/** The newest value across every day column: what "current" means here. */
export function readAnchor(
  sqlite: Database.Database,
  schema: string,
  columns: readonly ShiftColumn[],
): string | null {
  const days = columns.filter((column) => column.unit === "day");
  if (days.length === 0) return null;
  const newest = days
    .map(
      ({ table, column }) =>
        `SELECT max(${quoteName(column)}) AS dated FROM ${schema}.${quoteName(table)}`,
    )
    .join(" UNION ALL ");
  const row = sqlite
    .prepare(`SELECT max(dated) AS anchor FROM (${newest})`)
    .get() as { anchor: string | null } | undefined;
  return row?.anchor ?? null;
}

function quoteName(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}
