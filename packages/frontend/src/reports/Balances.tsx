/**
 * Balances: every account under its type, as of a day, with net worth.
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
import { isoDateSchema } from "bookkeeping-shared";
import { reportsApi } from "../api";
import { formatMoney } from "../entries/money";
import { fieldError } from "./report-params";
import { datasetNumber, useReportUrlDraft, type UrlRead } from "./report-screen";
import { useReportDataset, type ReportDatasetLoadContext } from "./use-report-dataset";

type BalancesParams = { asOf: string };

function readBalancesParams(raw: Record<string, string>): UrlRead<BalancesParams> {
  const asOf = raw.as_of ?? Temporal.Now.plainDateISO(appTimeZone()).toString();
  return {
    params: { asOf },
    errors: isoDateSchema.safeParse(asOf).success
      ? []
      : [{ field: "asOf", message: "The as-of day in the URL is invalid." }],
  };
}

async function loadBalances(input: BalancesParams, context: ReportDatasetLoadContext) {
  return reportsApi.balances({
    query: { as_of: input.asOf },
    fetchOptions: { signal: context.signal },
  });
}

function balanceStats(dataset: GridDataset): ReportStat[] {
  const assets = datasetNumber(dataset, "type:asset", "balance") ?? 0;
  const liabilities = datasetNumber(dataset, "type:liability", "balance") ?? 0;
  const netWorth = datasetNumber(dataset, "net-worth", "balance") ?? 0;
  return [
    { label: "Assets", value: formatMoney(assets), tone: "positive" },
    { label: "Liabilities", value: formatMoney(liabilities), tone: "negative" },
    {
      label: "Net worth",
      value: formatMoney(netWorth),
      tone: netWorth < 0 ? "negative" : "fg",
      strong: true,
    },
  ];
}

export function Balances() {
  const { urlState, draft, setDraft, apply } = useReportUrlDraft(readBalancesParams);
  const input = urlState.errors.length === 0 ? urlState.params : null;
  const report = useReportDataset({ input, load: loadBalances });

  return (
    <ReportScreenFrame title="Balances" subtitle="What you own and owe, as of a day.">
      <ReportToolbar
        actions={
          <ReportRunButton
            loading={report.loading}
            disabled={report.loading}
            onClick={() => apply({ as_of: draft.asOf })}
          />
        }
      >
        <label className="flex items-center gap-2 text-sap-data">
          <span className="text-sap-subtle">as of:</span>
          <Input
            type="date"
            className="h-sap-ctl w-[160px]"
            value={draft.asOf}
            aria-invalid={fieldError(urlState.errors, "asOf") ? true : undefined}
            onChange={(event) => setDraft({ asOf: event.target.value })}
          />
        </label>
      </ReportToolbar>

      {urlState.errors[0] ? <ReportError error={urlState.errors[0].message} /> : null}
      {report.status === "error" ? <ReportError error={report.error} /> : null}

      {report.dataset ? (
        <>
          <ReportSummaryStats stats={balanceStats(report.dataset)} />
          <div className="min-h-0 flex-1 overflow-auto">
            {report.dataset.nodes.length === 0 ? (
              <p className="p-[18px] text-sap-data text-sap-muted">
                No accounts yet. Create the chart of accounts to see balances here.
              </p>
            ) : (
              <ReportGridDataset dataset={report.dataset} linkContext={input ? { input } : undefined} />
            )}
          </div>
        </>
      ) : (
        <p className="p-[18px] text-sap-data text-sap-muted">Loading balances…</p>
      )}
    </ReportScreenFrame>
  );
}
