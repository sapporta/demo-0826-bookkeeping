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
import {
  visibleAccount,
  type AccountRow,
  type DayWindow,
  type LedgerAuth,
  type LedgerDb,
} from "../../modules/ledger/db/ledger-store.js";

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

export type AccountRead =
  | { ok: true; account: AccountRow }
  | { ok: false; response: { status: 404; body: ErrorBody } };

/**
 * The account a report was asked about, or the answer for one the caller
 * cannot see. An account nobody may read and an account that does not exist
 * are the same answer, so neither reveals the other.
 */
export function readAccount(
  db: LedgerDb,
  auth: LedgerAuth,
  accountId: number,
): AccountRead {
  const account = visibleAccount(db, auth, accountId);
  if (account === undefined) {
    return {
      ok: false,
      response: {
        status: 404,
        body: { error: "Account not found", code: "ACCOUNT_NOT_FOUND" },
      },
    };
  }
  return { ok: true, account };
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

/** Every calendar month the window touches, oldest first; null when open. */
export function monthsCovered(window: DayWindow): string[] | null {
  if (window.from === null || window.to === null) return null;
  const last = Temporal.PlainDate.from(window.to).toPlainYearMonth();
  const months: string[] = [];
  for (
    let month = Temporal.PlainDate.from(window.from).toPlainYearMonth();
    Temporal.PlainYearMonth.compare(month, last) <= 0;
    month = month.add({ months: 1 })
  ) {
    months.push(month.toString());
  }
  return months;
}

/**
 * The days of `month` that lie inside `window`.
 *
 * A month at either edge of a report is only partly covered by it, and a
 * drill-down into that month has to ask for the same days the summary
 * counted — otherwise the total a reader clicked stops matching the rows
 * they land on.
 */
export function monthWithin(month: string, window: DayWindow): { from: string; to: string } {
  const bounds = monthWindow(month);
  return {
    from: window.from !== null && window.from > bounds.from ? window.from : bounds.from,
    to: window.to !== null && window.to < bounds.to ? window.to : bounds.to,
  };
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

/** Opens one account's month-by-month summary over the bound period. */
export function accountMonthsLink(bind: Record<string, string>): NavLink {
  return {
    kind: "report",
    report: "account-months",
    bind,
    label: "Month by month",
  };
}

/**
 * The bind entries a drill-down uses to carry this report's window forward.
 * An open edge is left out: a link binding a null column resolves to nothing
 * and would silently disappear from every row.
 */
export function windowBind(window: DayWindow): Record<string, string> {
  return {
    ...(window.from === null ? {} : { period_from: "period_from" }),
    ...(window.to === null ? {} : { period_to: "period_to" }),
  };
}

export const editEntryLink: NavLink = {
  kind: "url",
  href: "/transactions/{transaction_id}/edit",
  label: "Edit entry",
  icon: "drill-into",
};
