// What the report screens share: URL-backed parameters with a local draft
// the toolbar edits, the period codec, and the register address other
// reports drill into.

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

/** The register for one account, over the period the reader is looking at. */
export function registerHref(accountId: number, period?: DateRangeState): string {
  const query: UrlQueryObject = {
    account_id: accountId,
    ...(period ? serializeDateRange(period, "period") : {}),
  };
  return `/reports/register?${buildSearchParams(query).toString()}`;
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
