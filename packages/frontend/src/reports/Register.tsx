/**
 * Account register: one account's postings in order with a running balance.
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
import { allTime, serializeDateRange, type DateRangeState } from "@sapporta/shared/daterange";
import type { GridDataset } from "@sapporta/shared/grid-dataset";
import { reportsApi } from "../api";
import { formatMoney } from "../entries/money";
import { fieldError } from "./report-params";
import { periodIssue, readPeriod, useReportUrlDraft, type UrlRead } from "./report-screen";
import { useReportDataset, type ReportDatasetLoadContext } from "./use-report-dataset";

type RegisterParams = { accountId: number | null; period: DateRangeState };

function readRegisterParams(raw: Record<string, string>): UrlRead<RegisterParams> {
  const errors: UrlRead<RegisterParams>["errors"] = [];
  const period = readPeriod(raw, allTime(), errors, "period");
  let accountId: number | null = null;
  if (raw.account_id !== undefined && raw.account_id !== "") {
    if (/^\d+$/.test(raw.account_id)) accountId = Number(raw.account_id);
    else errors.push({ field: "accountId", message: "The account in the URL is invalid." });
  }
  return { params: { accountId, period }, errors };
}

async function loadRegister(input: RegisterParams, context: ReportDatasetLoadContext) {
  return reportsApi.register({
    query: { account_id: input.accountId ?? 0, ...serializeDateRange(input.period, "period") },
    fetchOptions: { signal: context.signal },
  });
}

function registerStats(dataset: GridDataset): ReportStat[] {
  const opening = dataset.nodes.find((n) => n.kind === "opening")?.columns.balance;
  const closing = dataset.nodes.find((n) => n.kind === "closing")?.columns.balance;
  const totals = dataset.footerRows?.find((row) => row.rowKey === "totals")?.columns;
  const stats: ReportStat[] = [];
  if (typeof opening === "number") {
    stats.push({ label: "Opening", value: formatMoney(opening), tone: "muted" });
  }
  stats.push(
    { label: "Debits", value: formatMoney(Number(totals?.debit ?? 0)), tone: "fg" },
    { label: "Credits", value: formatMoney(Number(totals?.credit ?? 0)), tone: "fg" },
    {
      label: "Closing",
      value: formatMoney(typeof closing === "number" ? closing : 0),
      tone: typeof closing === "number" && closing < 0 ? "negative" : "fg",
      strong: true,
    },
  );
  return stats;
}

export function Register() {
  const { urlState, draft, setDraft, apply } = useReportUrlDraft(readRegisterParams);
  const accountLookup = useTableLookup<number>("accounts");
  const input =
    urlState.errors.length === 0 && urlState.params.accountId !== null ? urlState.params : null;
  const report = useReportDataset({ input, load: loadRegister });
  const draftIssue = periodIssue<RegisterParams>(draft.period, "period");

  function run() {
    apply({
      account_id: draft.accountId ?? undefined,
      ...serializeDateRange(draft.period, "period"),
    });
  }

  return (
    <ReportScreenFrame title="Account register" subtitle="Every posting to one account, with the running balance.">
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
            id="register-account"
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
          Choose an account and run the report to open its register.
        </p>
      ) : report.dataset ? (
        <>
          <ReportSummaryStats stats={registerStats(report.dataset)} />
          <div className="min-h-0 flex-1 overflow-auto">
            <ReportGridDataset dataset={report.dataset} linkContext={input ? { input } : undefined} />
          </div>
        </>
      ) : (
        <p className="p-[18px] text-sap-data text-sap-muted">Loading register…</p>
      )}
    </ReportScreenFrame>
  );
}
