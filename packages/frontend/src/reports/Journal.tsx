/**
 * Transactions: the journal for a period, each entry with its postings.
 * Open an entry from its date to edit it; record a new one from the header.
 */
import { Link } from "react-router-dom";
import { relative, serializeDateRange, type DateRangeState } from "@sapporta/shared/daterange";
import {
  DateRangeField,
  ReportError,
  ReportGridDataset,
  ReportRunButton,
  ReportScreenFrame,
  ReportTimeZoneNote,
  ReportToolbar,
  type ReportCellLinkResolvers,
} from "@sapporta/frontend/report";
import { buttonVariants } from "@sapporta/ui/button";
import { cn } from "@sapporta/ui/cn";
import { reportsApi } from "../api";
import { fieldError } from "./report-params";
import {
  periodIssue,
  readPeriod,
  registerHref,
  useReportUrlDraft,
  type UrlRead,
} from "./report-screen";
import { useReportDataset, type ReportDatasetLoadContext } from "./use-report-dataset";

type JournalParams = { period: DateRangeState };

const defaultPeriod = relative("30d");

function readJournalParams(raw: Record<string, string>): UrlRead<JournalParams> {
  const errors: UrlRead<JournalParams>["errors"] = [];
  const period = readPeriod(raw, defaultPeriod, errors, "period");
  return { params: { period }, errors };
}

async function loadJournal(input: JournalParams, context: ReportDatasetLoadContext) {
  return reportsApi.journal({
    query: serializeDateRange(input.period, "period"),
    fetchOptions: { signal: context.signal },
  });
}

/** A posting's account opens that account's register for the same period. */
const journalLinks: ReportCellLinkResolvers<JournalParams> = {
  posting: {
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

export function Journal() {
  const { urlState, draft, setDraft, apply } = useReportUrlDraft(readJournalParams);
  const input = urlState.errors.length === 0 ? urlState.params : null;
  const report = useReportDataset({ input, load: loadJournal });
  const draftIssue = periodIssue<JournalParams>(draft.period, "period");

  return (
    <ReportScreenFrame
      title="Transactions"
      subtitle="Open an entry from its date to change it."
      actions={
        <Link to="/transactions/new" className={cn(buttonVariants({ size: "sm" }), "no-underline")}>
          New entry
        </Link>
      }
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
        <div className="min-h-0 flex-1 overflow-auto">
          {report.dataset.nodes.length === 0 ? (
            <p className="p-[18px] text-sap-data text-sap-muted">
              Nothing recorded in this period.{" "}
              <Link to="/transactions/new" className="text-sap-link">Record an entry.</Link>
            </p>
          ) : (
            <ReportGridDataset
              dataset={report.dataset}
              links={journalLinks}
              linkContext={input ? { input } : undefined}
            />
          )}
        </div>
      ) : (
        <p className="p-[18px] text-sap-data text-sap-muted">Loading transactions…</p>
      )}
    </ReportScreenFrame>
  );
}
