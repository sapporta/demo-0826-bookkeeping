/**
 * Profit & Loss: what the household earned and what it spent over a period,
 * every income and expense account under its heading, and the net at the foot.
 *
 * The statement is the top of the drill-down: an account line opens that
 * account month by month over the same period, and from there the register
 * and the entry itself.
 */
import type { TsRestApi, SapportaEnv } from "@sapporta/server";
import { workspaceTimeZone } from "@sapporta/server";
import type { GridDataset, GridDatasetNode } from "@sapporta/shared/grid-dataset";
import {
  ACCOUNT_TYPE_LABELS,
  CATEGORY_ACCOUNT_TYPES,
  reportsContract,
  roundMoney,
  type AccountType,
} from "bookkeeping-shared";
import {
  accountBalances,
  type AccountBalanceRow,
} from "../../modules/ledger/db/ledger-store.js";
import { requireAuthorizedWorkspaceData } from "../../project-auth/index.js";
import {
  accountMonthsLink,
  displayBalance,
  hiddenColumn,
  moneyColumn,
  READ_REPORTS,
  readPeriod,
  windowBind,
  windowLabel,
  type ReportClock,
} from "./shared.js";

export function registerProfitLoss(api: TsRestApi<SapportaEnv>, clock: ReportClock) {
  api.register("profitLoss", reportsContract.profitLoss, ({ c, request }) => {
    const auth = requireAuthorizedWorkspaceData(c, READ_REPORTS);
    const read = readPeriod(request.query, workspaceTimeZone(auth), clock.now());
    if (!read.ok) return read.response;
    const { window } = read;
    const rows = accountBalances(c.get("db"), auth, window);
    return {
      status: 200,
      body: profitLossDataset({ rows, from: window.from, to: window.to }),
    };
  });
}

export type ProfitLossInput = {
  rows: readonly AccountBalanceRow[];
  from: string | null;
  to: string | null;
};

export function profitLossDataset({ rows, from, to }: ProfitLossInput): GridDataset {
  const totals = new Map<AccountType, number>();
  const nodes: GridDatasetNode[] = [];

  for (const type of CATEGORY_ACCOUNT_TYPES) {
    const accounts = rows.filter((row) => row.type === type);
    if (accounts.length === 0) continue;
    const children = accounts.map((row) => ({
      rowKey: `account:${row.id}`,
      levelName: "account",
      columns: {
        account_id: row.id,
        period_from: from,
        period_to: to,
        account: row.name,
        amount: displayBalance(type, row.balance),
      },
    }));
    const total = roundMoney(
      children.reduce((sum, node) => sum + Number(node.columns.amount), 0),
    );
    totals.set(type, total);
    nodes.push({
      rowKey: `type:${type}`,
      levelName: "type",
      columns: {
        account_id: null,
        period_from: from,
        period_to: to,
        account: ACCOUNT_TYPE_LABELS[type],
        amount: total,
      },
      children: { account: children },
    });
  }

  const net = roundMoney((totals.get("income") ?? 0) - (totals.get("expense") ?? 0));

  // A heading row carries no account id, so the drill-down resolves on the
  // account lines and is withheld from the two totals above them.
  const columns = [
    hiddenColumn("account_id", "number"),
    hiddenColumn("period_from", "date"),
    hiddenColumn("period_to", "date"),
    {
      id: "account",
      label: "Account",
      kind: "text" as const,
      minWidth: 36,
      links: [
        accountMonthsLink({
          account_id: "account_id",
          ...windowBind({ from, to }),
        }),
      ],
    },
    moneyColumn("amount", "Amount"),
  ];

  return {
    name: "profit-loss",
    label: `Profit & Loss, ${windowLabel({ from, to })}`,
    rootLevel: "type",
    levels: {
      // Two lines and a net is the whole statement; the accounts behind each
      // are one expand away for a reader who wants to know which.
      type: {
        label: "Income and expenses",
        columns,
        childLevels: ["account"],
        defaultCollapsed: true,
      },
      account: { label: "Accounts", columns, childLevels: [] },
    },
    nodes,
    footerRows: [
      {
        rowKey: "net",
        columns: { account: "Net (income − expenses)", amount: net },
      },
    ],
  };
}
