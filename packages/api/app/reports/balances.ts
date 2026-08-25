/**
 * Balances: what the household owns and owes as of a day, every account
 * grouped under its type, with net worth at the foot.
 */
import type { TsRestApi, SapportaEnv } from "@sapporta/server";
import { workspaceTimeZone } from "@sapporta/server";
import type { GridDataset, GridDatasetNode } from "@sapporta/shared/grid-dataset";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
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
  displayBalance,
  hiddenColumn,
  moneyColumn,
  READ_REPORTS,
  registerLink,
  todayIn,
  type ReportClock,
} from "./shared.js";

export function registerBalances(api: TsRestApi<SapportaEnv>, clock: ReportClock) {
  api.register("balances", reportsContract.balances, ({ c, request }) => {
    const auth = requireAuthorizedWorkspaceData(c, READ_REPORTS);
    const asOf =
      request.query.as_of ?? todayIn(workspaceTimeZone(auth), clock.now()).toString();
    const rows = accountBalances(c.get("db"), auth, { from: null, to: asOf });
    return { status: 200, body: balancesDataset({ rows, asOf }) };
  });
}

export type BalancesInput = { rows: readonly AccountBalanceRow[]; asOf: string };

export function balancesDataset({ rows, asOf }: BalancesInput): GridDataset {
  const totals = new Map<AccountType, number>();
  const nodes: GridDatasetNode[] = [];

  for (const type of ACCOUNT_TYPES) {
    const accounts = rows.filter((row) => row.type === type);
    if (accounts.length === 0) continue;
    const children = accounts.map((row) => ({
      rowKey: `account:${row.id}`,
      levelName: "account",
      columns: {
        account_id: row.id,
        account: row.name,
        balance: displayBalance(type, row.balance),
        period_to: asOf,
      },
    }));
    const total = roundMoney(
      children.reduce((sum, node) => sum + Number(node.columns.balance), 0),
    );
    totals.set(type, total);
    nodes.push({
      rowKey: `type:${type}`,
      levelName: "type",
      columns: {
        account_id: null,
        account: ACCOUNT_TYPE_LABELS[type],
        balance: total,
        period_to: asOf,
      },
      children: { account: children },
    });
  }

  const netWorth = roundMoney(
    (totals.get("asset") ?? 0) - (totals.get("liability") ?? 0),
  );

  const columns = [
    hiddenColumn("account_id", "number"),
    hiddenColumn("period_to", "date"),
    {
      id: "account",
      label: "Account",
      kind: "text" as const,
      minWidth: 36,
      links: [registerLink({ account_id: "account_id", period_to: "period_to" })],
    },
    moneyColumn("balance", "Balance", { colorRule: "signed" }),
  ];

  return {
    name: "balances",
    label: `Balances as of ${asOf}`,
    rootLevel: "type",
    levels: {
      type: { label: "Account types", columns, childLevels: ["account"] },
      account: { label: "Accounts", columns, childLevels: [] },
    },
    nodes,
    footerRows: [
      {
        rowKey: "net-worth",
        columns: { account: "Net worth (assets − liabilities)", balance: netWorth },
      },
    ],
  };
}
