/**
 * Spending: each expense account's month against its budget.
 */
import { appTimeZone } from "@sapporta/frontend/platform";
import {
  ReportError,
  ReportGridDataset,
  ReportRunButton,
  ReportScreenFrame,
  ReportSummaryStats,
  ReportToolbar,
  type ReportStat,
} from "@sapporta/frontend/report";
import type { GridDataset } from "@sapporta/shared/grid-dataset";
import { Temporal } from "@sapporta/shared/temporal";
import { Input } from "@sapporta/ui/input";
import { Link } from "react-router-dom";
import { monthSchema } from "bookkeeping-shared";
import { reportsApi } from "../api";
import { formatMoney } from "../entries/money";
import { fieldError } from "./report-params";
import { datasetNumber, useReportUrlDraft, type UrlRead } from "./report-screen";
import { useReportDataset, type ReportDatasetLoadContext } from "./use-report-dataset";

type SpendingParams = { month: string };

function readSpendingParams(raw: Record<string, string>): UrlRead<SpendingParams> {
  const month =
    raw.month ?? Temporal.Now.plainDateISO(appTimeZone()).toPlainYearMonth().toString();
  return {
    params: { month },
    errors: monthSchema.safeParse(month).success
      ? []
      : [{ field: "month", message: "The month in the URL is invalid." }],
  };
}

async function loadSpending(input: SpendingParams, context: ReportDatasetLoadContext) {
  return reportsApi.spending({
    query: { month: input.month },
    fetchOptions: { signal: context.signal },
  });
}

function spendingStats(dataset: GridDataset): ReportStat[] {
  const budget = datasetNumber(dataset, "total", "budget") ?? 0;
  const spent = datasetNumber(dataset, "total", "actual") ?? 0;
  const remaining = datasetNumber(dataset, "total", "remaining") ?? 0;
  return [
    { label: "Budgeted", value: formatMoney(budget), tone: "muted" },
    { label: "Spent", value: formatMoney(spent), tone: "fg" },
    {
      label: "Remaining",
      value: formatMoney(remaining),
      tone: remaining < 0 ? "negative" : "positive",
      strong: true,
    },
  ];
}

export function Spending() {
  const { urlState, draft, setDraft, apply } = useReportUrlDraft(readSpendingParams);
  const input = urlState.errors.length === 0 ? urlState.params : null;
  const report = useReportDataset({ input, load: loadSpending });

  return (
    <ReportScreenFrame
      title="Spending"
      subtitle="Each expense account against its monthly budget."
      actions={
        <Link to="/tables/budgets" className="text-sap-data text-sap-muted hover:text-sap-emph">
          Budgets
        </Link>
      }
    >
      <ReportToolbar
        actions={
          <ReportRunButton
            loading={report.loading}
            disabled={report.loading}
            onClick={() => apply({ month: draft.month })}
          />
        }
      >
        <label className="flex items-center gap-2 text-sap-data">
          <span className="text-sap-subtle">month:</span>
          <Input
            type="month"
            className="h-sap-ctl w-[160px]"
            value={draft.month}
            aria-invalid={fieldError(urlState.errors, "month") ? true : undefined}
            onChange={(event) => setDraft({ month: event.target.value })}
          />
        </label>
      </ReportToolbar>

      {urlState.errors[0] ? <ReportError error={urlState.errors[0].message} /> : null}
      {report.status === "error" ? <ReportError error={report.error} /> : null}

      {report.dataset ? (
        <>
          <ReportSummaryStats stats={spendingStats(report.dataset)} />
          <div className="min-h-0 flex-1 overflow-auto">
            {report.dataset.nodes.length === 0 ? (
              <p className="p-[18px] text-sap-data text-sap-muted">
                No expense accounts yet. Expense accounts are the categories entries are filed under.
              </p>
            ) : (
              <ReportGridDataset dataset={report.dataset} linkContext={input ? { input } : undefined} />
            )}
          </div>
        </>
      ) : (
        <p className="p-[18px] text-sap-data text-sap-muted">Loading spending…</p>
      )}
    </ReportScreenFrame>
  );
}
