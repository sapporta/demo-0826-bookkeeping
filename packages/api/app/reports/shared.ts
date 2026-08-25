/**
 * What every ledger report shares: the ability it checks, how it reads a
 * period from the query in the workspace's calendar, and the column and link
 * shapes that keep the reports reading alike.
 */
import type { ErrorBody, NavLink } from "@sapporta/shared/contracts";
import {
  DateRangeParseError,
  resolveDateRangeQueryBounds,
} from "@sapporta/shared/daterange";
import type { GridDatasetColumn } from "@sapporta/shared/grid-dataset";
import { Temporal, type TimeZone } from "@sapporta/shared/temporal";
import { normalBalanceSign, roundMoney, type AccountType } from "bookkeeping-shared";
import type { DayWindow } from "../../modules/ledger/db/ledger-store.js";

export const READ_REPORTS = { action: "read", subject: "reports" } as const;

/** The application clock, injected where the routes are assembled. */
export type ReportClock = { now(): Temporal.Instant };

export function todayIn(zone: TimeZone, now: Temporal.Instant): Temporal.PlainDate {
  return now.toZonedDateTimeISO(zone).toPlainDate();
}

export type PeriodRead =
  | { ok: true; window: DayWindow }
  | { ok: false; response: { status: 400; body: ErrorBody } };

/**
 * Reads the `period_*` query keys against the workspace calendar, as the
 * inclusive window of days the ledger store filters by.
 */
export function readPeriod(
  query: Record<string, unknown>,
  zone: TimeZone,
  now: Temporal.Instant,
): PeriodRead {
  try {
    const period = resolveDateRangeQueryBounds("period", query, zone, now);
    return { ok: true, window: { from: period.days.from, to: period.days.to } };
  } catch (error) {
    const message =
      error instanceof DateRangeParseError
        ? error.message
        : "Report period is invalid.";
    return {
      ok: false,
      response: {
        status: 400,
        body: { error: message, code: "INVALID_REPORT_PERIOD" },
      },
    };
  }
}

/** How a report names the window it covers. */
export function windowLabel({ from, to }: DayWindow): string {
  return from === null && to === null
    ? "all time"
    : `${from ?? "the beginning"} to ${to ?? "today"}`;
}

/** A calendar month as the inclusive window of its days. */
export function monthWindow(month: string): { from: string; to: string } {
  const first = Temporal.PlainYearMonth.from(month).toPlainDate({ day: 1 });
  const last = first.add({ months: 1 }).subtract({ days: 1 });
  return { from: first.toString(), to: last.toString() };
}

/**
 * A stored balance in the sign a person expects: a savings account and a
 * credit-card debt both read as positive numbers.
 */
export function displayBalance(type: AccountType, signedSum: number): number {
  return roundMoney(normalBalanceSign(type) * signedSum);
}

export function moneyColumn(
  id: string,
  label: string,
  extra: Partial<GridDatasetColumn> = {},
): GridDatasetColumn {
  return {
    id,
    label,
    kind: "number",
    displayFormat: "currency",
    zeroDisplay: "dot",
    ...extra,
  };
}

export function hiddenColumn(
  id: string,
  kind: GridDatasetColumn["kind"],
): GridDatasetColumn {
  return { id, label: id, kind, visuallyHidden: true };
}

/** Opens the account register, carrying whichever bound values the row has. */
export function registerLink(bind: Record<string, string>): NavLink {
  return { kind: "report", report: "register", bind, label: "Account register" };
}

export const editEntryLink: NavLink = {
  kind: "url",
  href: "/transactions/{transaction_id}/edit",
  label: "Edit entry",
  icon: "drill-into",
};
