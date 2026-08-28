/**
 * One account month by month: the middle of the drill-down.
 *
 * Reached from a Profit & Loss line, and each month opens the register for
 * exactly the days the month counted.
 */
import { useTableLookup, LookupPicker } from "@sapporta/frontend/lookup";
import {
  DateRangeField,
  ReportError,
  ReportGridDataset,
  ReportRunButton,
  ReportScreenFrame,
  ReportSummaryStats,
  ReportTimeZoneNote,
  ReportToolbar,
  type ReportStat,
} from "@sapporta/frontend/report";
import { relative, serializeDateRange, type DateRangeState } from "@sapporta/shared/daterange";
import type { GridDataset } from "@sapporta/shared/grid-dataset";
import { reportsApi } from "../api";
import { formatMoney } from "../entries/money";
import { fieldError } from "./report-params";
import { ReportTrail } from "./ReportTrail";
import {
  datasetNumber,
  periodIssue,
  profitLossHref,
  readPeriod,
  useReportUrlDraft,
  type UrlRead,
} from "./report-screen";
import { useReportDataset, type ReportDatasetLoadContext } from "./use-report-dataset";

type AccountMonthsParams = { accountId: number | null; period: DateRangeState };

// The same year the statement this drills down from covers.
const defaultPeriod = relative("1y");

function readAccountMonthsParams(
  raw: Record<string, string>,
): UrlRead<AccountMonthsParams> {
  const errors: UrlRead<AccountMonthsParams>["errors"] = [];
  const period = readPeriod(raw, defaultPeriod, errors, "period");
  let accountId: number | null = null;
  if (raw.account_id !== undefined && raw.account_id !== "") {
    if (/^\d+$/.test(raw.account_id)) accountId = Number(raw.account_id);
    else errors.push({ field: "accountId", message: "The account in the URL is invalid." });
  }
  return { params: { accountId, period }, errors };
}

async function loadAccountMonths(
  input: AccountMonthsParams,
  context: ReportDatasetLoadContext,
) {
  return reportsApi.accountMonths({
    query: { account_id: input.accountId ?? 0, ...serializeDateRange(input.period, "period") },
    fetchOptions: { signal: context.signal },
  });
}

/** The month that carries the most of the period, which is what a reader
 *  scanning for an unusual total is looking for. */
function largestMonth(dataset: GridDataset) {
  let largest: { month: string; amount: number } | null = null;
  for (const node of dataset.nodes) {
    const amount = node.columns.amount;
    const month = node.columns.month;
    if (typeof amount !== "number" || typeof month !== "string") continue;
    if (largest === null || amount > largest.amount) largest = { month, amount };
  }
  return largest;
}

function accountMonthsStats(dataset: GridDataset): ReportStat[] {
  const total = datasetNumber(dataset, "total", "amount") ?? 0;
  const entries = datasetNumber(dataset, "total", "entries") ?? 0;
  const largest = largestMonth(dataset);
  return [
    { label: "Entries", value: String(entries), tone: "muted" },
    {
      label: "Largest month",
      value: largest === null ? "—" : `${largest.month} · ${formatMoney(largest.amount)}`,
      tone: "fg",
    },
    {
      label: "Total",
      value: formatMoney(total),
      tone: total < 0 ? "negative" : "fg",
      strong: true,
    },
  ];
}

export function AccountMonths() {
  const { urlState, draft, setDraft, apply } = useReportUrlDraft(readAccountMonthsParams);
  const accountLookup = useTableLookup<number>("accounts");
  const input =
    urlState.errors.length === 0 && urlState.params.accountId !== null
      ? urlState.params
      : null;
  const report = useReportDataset({ input, load: loadAccountMonths });
  const draftIssue = periodIssue<AccountMonthsParams>(draft.period, "period");

  function run() {
    apply({
      account_id: draft.accountId ?? undefined,
      ...serializeDateRange(draft.period, "period"),
    });
  }

  return (
    <ReportScreenFrame
      title="Account by month"
      subtitle="One account's total for each month. Open a month to see its entries."
      actions={
        <ReportTrail to={profitLossHref(urlState.params.period)} label="Profit & Loss" />
      }
    >
      <ReportToolbar
        actions={
          <ReportRunButton
            loading={report.loading}
            disabled={report.loading || draft.accountId === null || draftIssue !== null}
            onClick={run}
          />
        }
      >
        <label className="flex items-center gap-2 text-sap-data">
          <span className="text-sap-subtle">account:</span>
          <LookupPicker<number>
            id="account-months-account"
            lookup={accountLookup}
            value={draft.accountId}
            onChange={(accountId) => setDraft({ ...draft, accountId })}
            placeholder="Choose an account"
            className="w-[240px]"
            ariaInvalid={fieldError(urlState.errors, "accountId") !== null}
          />
        </label>
        <DateRangeField
          label="Period"
          value={draft.period}
          onChange={(period) => setDraft({ ...draft, period })}
          error={draftIssue?.message ?? fieldError(urlState.errors, "period")}
        />
        <ReportTimeZoneNote />
      </ReportToolbar>

      {urlState.errors[0] ? <ReportError error={urlState.errors[0].message} /> : null}
      {report.status === "error" ? <ReportError error={report.error} /> : null}

      {input === null && urlState.errors.length === 0 ? (
        <p className="p-[18px] text-sap-data text-sap-muted">
          Choose an account and run the report to see its months.
        </p>
      ) : report.dataset ? (
        <>
          <ReportSummaryStats stats={accountMonthsStats(report.dataset)} />
          <div className="min-h-0 flex-1 overflow-auto">
            <ReportGridDataset
              dataset={report.dataset}
              linkContext={input ? { input } : undefined}
            />
          </div>
        </>
      ) : (
        <p className="p-[18px] text-sap-data text-sap-muted">Loading months…</p>
      )}
    </ReportScreenFrame>
  );
}
