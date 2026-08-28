// What the report screens share: URL-backed parameters with a local draft
// the toolbar edits, the period codec, and the addresses the reports drill
// between.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { buildSearchParams, type UrlQueryObject } from "@sapporta/frontend/report";
import type { GridDataset } from "@sapporta/shared/grid-dataset";
import {
  dateRangeFieldNames,
  parseDateRange,
  serializeDateRange,
  type DateRangeState,
} from "@sapporta/shared/daterange";
import { Temporal } from "@sapporta/shared/temporal";
import type { ReportParamError } from "./report-params";

export type UrlRead<T> = { params: T; errors: ReportParamError<T>[] };

/**
 * Parameters live in the URL so a report reloads and shares. The toolbar
 * edits a draft; Run writes the draft back to the URL, which is what the
 * report actually loads from.
 */
export function useReportUrlDraft<T>(read: (raw: Record<string, string>) => UrlRead<T>) {
  const [searchParams, setSearchParams] = useSearchParams();
  const key = searchParams.toString();
  const urlState = useMemo(
    () => read(Object.fromEntries(searchParams.entries())),
    // The string form is the identity of the URL state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, read],
  );
  const [draft, setDraft] = useState<T>(urlState.params);
  useEffect(() => {
    setDraft(urlState.params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    urlState,
    draft,
    setDraft,
    apply: (query: UrlQueryObject) => setSearchParams(buildSearchParams(query)),
  };
}

/**
 * The `period_*` keys of the URL as a date range, or `fallback` when the URL
 * names none. A range that cannot be read, or that ends before it starts,
 * adds an issue for `field`.
 */
export function readPeriod<T>(
  raw: Record<string, string>,
  fallback: DateRangeState,
  errors: ReportParamError<T>[],
  field: keyof T,
): DateRangeState {
  const names = dateRangeFieldNames("period");
  const named = [names.relative, names.from, names.to].some((key) => key in raw);
  if (!named) return fallback;
  let period: DateRangeState;
  try {
    period = parseDateRange("period", raw);
  } catch {
    errors.push({ field, message: "The period in the URL is invalid." });
    return fallback;
  }
  const issue = periodIssue(period, field);
  if (issue) errors.push(issue);
  return period;
}

export function periodIssue<T>(
  period: DateRangeState,
  field: keyof T,
): ReportParamError<T> | null {
  if (
    period.type === "custom" &&
    period.start &&
    period.end &&
    Temporal.PlainDate.compare(period.start, period.end) > 0
  ) {
    return { field, message: "The period must start on or before it ends." };
  }
  return null;
}

/**
 * What a report about one account over a period reads from the URL: the
 * client side of the `accountPeriodQuery` the register and the monthly
 * summary both take, so the two cannot drift on what an account id is or
 * what to say when the URL holds a bad one.
 */
export type AccountPeriodParams = {
  accountId: number | null;
  period: DateRangeState;
};

export function readAccountPeriodParams(
  raw: Record<string, string>,
  fallback: DateRangeState,
): UrlRead<AccountPeriodParams> {
  const errors: UrlRead<AccountPeriodParams>["errors"] = [];
  const period = readPeriod(raw, fallback, errors, "period");
  let accountId: number | null = null;
  if (raw.account_id !== undefined && raw.account_id !== "") {
    if (/^\d+$/.test(raw.account_id)) accountId = Number(raw.account_id);
    else {
      errors.push({ field: "accountId", message: "The account in the URL is invalid." });
    }
  }
  return { params: { accountId, period }, errors };
}

/**
 * A report screen's address, carrying the period the reader is looking at.
 *
 * The same addresses the server binds its declarative drill-down links to;
 * a screen builds one when it links somewhere the dataset does not.
 */
function reportHref(
  path: string,
  query: UrlQueryObject,
  period?: DateRangeState,
): string {
  const search = buildSearchParams({
    ...query,
    ...(period ? serializeDateRange(period, "period") : {}),
  });
  return `${path}?${search.toString()}`;
}

/** The register for one account, over the period the reader is looking at. */
export function registerHref(accountId: number, period?: DateRangeState): string {
  return reportHref("/reports/register", { account_id: accountId }, period);
}

/** The statement the drill-down starts from. */
export function profitLossHref(period?: DateRangeState): string {
  return reportHref("/reports/profit-loss", {}, period);
}

/** One number out of a dataset, by row key and column. */
export function datasetNumber(
  dataset: GridDataset,
  rowKey: string,
  column: string,
): number | null {
  const node =
    dataset.nodes.find((n) => n.rowKey === rowKey) ??
    dataset.footerRows?.find((n) => n.rowKey === rowKey);
  const value = node?.columns[column];
  return typeof value === "number" ? value : null;
}
