/**
 * One account, month by month: the middle of the drill-down.
 *
 * A Profit & Loss line answers "how much for the year"; this answers "which
 * months was it", and each month opens the register for exactly the days it
 * counted. A window with both edges named also shows the months the account
 * saw nothing in, so a reader sees the shape of the year rather than a list
 * with holes in it; an open window can only show the months that have rows.
 */
import type { TsRestApi, SapportaEnv } from "@sapporta/server";
import { workspaceTimeZone } from "@sapporta/server";
import type { GridDataset } from "@sapporta/shared/grid-dataset";
import { reportsContract, roundMoney } from "bookkeeping-shared";
import {
  accountMonthTotals,
  type AccountMonthRow,
  type AccountRow,
} from "../../modules/ledger/db/ledger-store.js";
import { requireAuthorizedWorkspaceData } from "../../project-auth/index.js";
import {
  displayBalance,
  hiddenColumn,
  moneyColumn,
  monthsCovered,
  monthWithin,
  READ_REPORTS,
  readAccount,
  readPeriod,
  registerLink,
  windowLabel,
  type ReportClock,
} from "./shared.js";

export function registerAccountMonths(
  api: TsRestApi<SapportaEnv>,
  clock: ReportClock,
) {
  api.register("accountMonths", reportsContract.accountMonths, ({ c, request }) => {
    const auth = requireAuthorizedWorkspaceData(c, READ_REPORTS);
    const read = readPeriod(request.query, workspaceTimeZone(auth), clock.now());
    if (!read.ok) return read.response;
    const db = c.get("db");
    const found = readAccount(db, auth, request.query.account_id);
    if (!found.ok) return found.response;
    const { account } = found;
    const { window } = read;
    return {
      status: 200,
      body: accountMonthsDataset({
        account,
        rows: accountMonthTotals(db, auth, account.id, window),
        from: window.from,
        to: window.to,
      }),
    };
  });
}

export type AccountMonthsInput = {
  account: AccountRow;
  rows: readonly AccountMonthRow[];
  from: string | null;
  to: string | null;
};

export function accountMonthsDataset({
  account,
  rows,
  from,
  to,
}: AccountMonthsInput): GridDataset {
  const totalled = new Map(rows.map((row) => [row.month, row]));
  const months = monthsCovered({ from, to }) ?? rows.map((row) => row.month);

  const lines = months.map((month) => {
    const row = totalled.get(month);
    const days = monthWithin(month, { from, to });
    return {
      month,
      days,
      entries: row?.entries ?? 0,
      debits: roundMoney(row?.debits ?? 0),
      credits: roundMoney(row?.credits ?? 0),
      amount: displayBalance(account.type, row?.amount ?? 0),
    };
  });

  const total = roundMoney(lines.reduce((sum, line) => sum + line.amount, 0));
  // A month's share is measured against the gross of the months rather than
  // their net, so an account whose months run both ways - a bank account, a
  // card - cannot show a share of several hundred percent in a year that
  // nets out near zero. An income or expense account only runs one way, so
  // for the accounts a Profit & Loss drills into the two are the same number.
  const gross = roundMoney(
    lines.reduce((sum, line) => sum + Math.abs(line.amount), 0),
  );
  const share = (amount: number) => (gross === 0 ? null : amount / gross);
  const entries = lines.reduce((sum, line) => sum + line.entries, 0);
  const debits = roundMoney(lines.reduce((sum, line) => sum + line.debits, 0));
  const credits = roundMoney(lines.reduce((sum, line) => sum + line.credits, 0));

  // Every month row carries the days it counted, so the register it opens
  // covers exactly the postings behind the number that was clicked.
  const monthDrillDown = registerLink({
    account_id: "account_id",
    period_from: "period_from",
    period_to: "period_to",
  });

  return {
    name: "account-months",
    label: `${account.name} — month by month, ${windowLabel({ from, to })}`,
    rootLevel: "month",
    levels: {
      month: {
        label: "Months",
        childLevels: [],
        rowLinks: [monthDrillDown],
        columns: [
          hiddenColumn("account_id", "number"),
          hiddenColumn("period_from", "date"),
          hiddenColumn("period_to", "date"),
          {
            id: "month",
            label: "Month",
            kind: "text",
            width: 12,
            links: [monthDrillDown],
          },
          {
            id: "entries",
            label: "Entries",
            kind: "number",
            width: 10,
            zeroDisplay: "dot",
          },
          moneyColumn("debits", "Debits", { zeroDisplay: "dot" }),
          moneyColumn("credits", "Credits", { zeroDisplay: "dot" }),
          moneyColumn("amount", "Amount", { strong: true }),
          {
            id: "share",
            label: "Share",
            kind: "number",
            displayFormat: "percentage",
            zeroDisplay: "blank",
            notes: "This month's share of the period's movement.",
          },
        ],
      },
    },
    nodes: lines.map((line) => ({
      rowKey: `month:${line.month}`,
      levelName: "month",
      columns: {
        account_id: account.id,
        period_from: line.days.from,
        period_to: line.days.to,
        month: line.month,
        entries: line.entries,
        debits: line.debits,
        credits: line.credits,
        amount: line.amount,
        share: share(line.amount),
      },
    })),
    footerRows: [
      {
        rowKey: "total",
        columns: {
          month: "Total",
          entries,
          debits,
          credits,
          amount: total,
        },
      },
    ],
  };
}
