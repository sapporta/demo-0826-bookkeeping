/**
 * Profit & Loss: income and expenses by account over a period, and the net.
 *
 * The account lines drill into the account month by month. That link is
 * declared by the dataset the server returns, so there is nothing to resolve
 * here.
 */
import {
  relative,
  serializeDateRange,
  type DateRangeState,
} from "@sapporta/shared/daterange";
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
import type { GridDataset } from "@sapporta/shared/grid-dataset";
import { reportsApi } from "../api";
import { formatMoney } from "../entries/money";
import { fieldError } from "./report-params";
import {
  datasetNumber,
  periodIssue,
  readPeriod,
  useReportUrlDraft,
  type UrlRead,
} from "./report-screen";
import { useReportDataset, type ReportDatasetLoadContext } from "./use-report-dataset";

type ProfitLossParams = { period: DateRangeState };

// A statement covers a year. The rolling one always holds a full set of
// months, whichever month a reader opens it in.
const defaultPeriod = relative("1y");

function readProfitLossParams(raw: Record<string, string>): UrlRead<ProfitLossParams> {
  const errors: UrlRead<ProfitLossParams>["errors"] = [];
  const period = readPeriod(raw, defaultPeriod, errors, "period");
  return { params: { period }, errors };
}

async function loadProfitLoss(
  input: ProfitLossParams,
  context: ReportDatasetLoadContext,
) {
  return reportsApi.profitLoss({
    query: serializeDateRange(input.period, "period"),
    fetchOptions: { signal: context.signal },
  });
}

function profitLossStats(dataset: GridDataset): ReportStat[] {
  const income = datasetNumber(dataset, "type:income", "amount") ?? 0;
  const expenses = datasetNumber(dataset, "type:expense", "amount") ?? 0;
  const net = datasetNumber(dataset, "net", "amount") ?? 0;
  return [
    { label: "Income", value: formatMoney(income), tone: "positive" },
    { label: "Expenses", value: formatMoney(expenses), tone: "negative" },
    { label: "Net", value: formatMoney(net), tone: net < 0 ? "negative" : "fg", strong: true },
  ];
}

export function ProfitLoss() {
  const { urlState, draft, setDraft, apply } = useReportUrlDraft(readProfitLossParams);
  const input = urlState.errors.length === 0 ? urlState.params : null;
  const report = useReportDataset({ input, load: loadProfitLoss });
  const draftIssue = periodIssue<ProfitLossParams>(draft.period, "period");

  return (
    <ReportScreenFrame
      title="Profit & Loss"
      subtitle="What came in and what went out. Open an account to see its months."
    >
      <ReportToolbar
        actions={
          <ReportRunButton
            loading={report.loading}
            disabled={report.loading || draftIssue !== null}
            onClick={() => apply(serializeDateRange(draft.period, "period"))}
          />
        }
      >
        <DateRangeField
          label="Period"
          value={draft.period}
          onChange={(period) => setDraft({ period })}
          error={draftIssue?.message ?? fieldError(urlState.errors, "period")}
        />
        <ReportTimeZoneNote />
      </ReportToolbar>

      {urlState.errors[0] ? <ReportError error={urlState.errors[0].message} /> : null}
      {report.status === "error" ? <ReportError error={report.error} /> : null}

      {report.dataset ? (
        <>
          <ReportSummaryStats stats={profitLossStats(report.dataset)} />
          <div className="min-h-0 flex-1 overflow-auto">
            {report.dataset.nodes.length === 0 ? (
              <p className="p-[18px] text-sap-data text-sap-muted">
                No income or expense accounts yet.
              </p>
            ) : (
              <ReportGridDataset
                dataset={report.dataset}
                linkContext={input ? { input } : undefined}
              />
            )}
          </div>
        </>
      ) : (
        <p className="p-[18px] text-sap-data text-sap-muted">Loading profit &amp; loss…</p>
      )}
    </ReportScreenFrame>
  );
}
