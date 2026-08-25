/**
 * Cash flow: income and expenses by account over a period, and the net.
 */
import { relative, type DateRangeState } from "@sapporta/shared/daterange";
import {
  DateRangeField,
  ReportError,
  ReportGridDataset,
  ReportRunButton,
  ReportScreenFrame,
  ReportSummaryStats,
  ReportTimeZoneNote,
  ReportToolbar,
  type ReportCellLinkResolvers,
  type ReportStat,
} from "@sapporta/frontend/report";
import { serializeDateRange } from "@sapporta/shared/daterange";
import type { GridDataset } from "@sapporta/shared/grid-dataset";
import { reportsApi } from "../api";
import { formatMoney } from "../entries/money";
import { fieldError } from "./report-params";
import {
  datasetNumber,
  periodIssue,
  readPeriod,
  registerHref,
  useReportUrlDraft,
  type UrlRead,
} from "./report-screen";
import { useReportDataset, type ReportDatasetLoadContext } from "./use-report-dataset";

type CashFlowParams = { period: DateRangeState };

const defaultPeriod = relative("mtd");

function readCashFlowParams(raw: Record<string, string>): UrlRead<CashFlowParams> {
  const errors: UrlRead<CashFlowParams>["errors"] = [];
  const period = readPeriod(raw, defaultPeriod, errors, "period");
  return { params: { period }, errors };
}

async function loadCashFlow(input: CashFlowParams, context: ReportDatasetLoadContext) {
  return reportsApi.cashFlow({
    query: serializeDateRange(input.period, "period"),
    fetchOptions: { signal: context.signal },
  });
}

/** Account rows open the register for the same period. */
const cashFlowLinks: ReportCellLinkResolvers<CashFlowParams> = {
  account: {
    cell: {
      account: ({ node, input }) => {
        const id = node.columns.account_id;
        if (typeof id !== "number") return [];
        return [
          { label: "Account register", href: registerHref(id, input?.period), icon: "report" },
        ];
      },
    },
  },
};

function cashFlowStats(dataset: GridDataset): ReportStat[] {
  const income = datasetNumber(dataset, "type:income", "amount") ?? 0;
  const expenses = datasetNumber(dataset, "type:expense", "amount") ?? 0;
  const net = datasetNumber(dataset, "net", "amount") ?? 0;
  return [
    { label: "Income", value: formatMoney(income), tone: "positive" },
    { label: "Expenses", value: formatMoney(expenses), tone: "negative" },
    { label: "Net", value: formatMoney(net), tone: net < 0 ? "negative" : "fg", strong: true },
  ];
}

export function CashFlow() {
  const { urlState, draft, setDraft, apply } = useReportUrlDraft(readCashFlowParams);
  const input = urlState.errors.length === 0 ? urlState.params : null;
  const report = useReportDataset({ input, load: loadCashFlow });
  const draftIssue = periodIssue<CashFlowParams>(draft.period, "period");

  return (
    <ReportScreenFrame title="Cash flow" subtitle="Where money came from and where it went.">
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
          <ReportSummaryStats stats={cashFlowStats(report.dataset)} />
          <div className="min-h-0 flex-1 overflow-auto">
            {report.dataset.nodes.length === 0 ? (
              <p className="p-[18px] text-sap-data text-sap-muted">
                No income or expense accounts yet.
              </p>
            ) : (
              <ReportGridDataset
                dataset={report.dataset}
                links={cashFlowLinks}
                linkContext={input ? { input } : undefined}
              />
            )}
          </div>
        </>
      ) : (
        <p className="p-[18px] text-sap-data text-sap-muted">Loading cash flow…</p>
      )}
    </ReportScreenFrame>
  );
}
