/**
 * Spending: each expense account's budget for a month against what was
 * actually filed under it, with what is left and how much of the budget is
 * used.
 */
import type { TsRestApi, SapportaEnv } from "@sapporta/server";
import { workspaceTimeZone } from "@sapporta/server";
import type { GridDataset } from "@sapporta/shared/grid-dataset";
import { reportsContract, roundMoney } from "bookkeeping-shared";
import {
  accountBalances,
  budgetsForMonth,
  type AccountBalanceRow,
} from "../../modules/ledger/db/ledger-store.js";
import { requireAuthorizedWorkspaceData } from "../../project-auth/index.js";
import {
  displayBalance,
  hiddenColumn,
  moneyColumn,
  monthWindow,
  READ_REPORTS,
  registerLink,
  todayIn,
  type ReportClock,
} from "./shared.js";

export function registerSpending(api: TsRestApi<SapportaEnv>, clock: ReportClock) {
  api.register("spending", reportsContract.spending, ({ c, request }) => {
    const auth = requireAuthorizedWorkspaceData(c, READ_REPORTS);
    const month =
      request.query.month ??
      todayIn(workspaceTimeZone(auth), clock.now()).toPlainYearMonth().toString();
    const window = monthWindow(month);
    const db = c.get("db");
    return {
      status: 200,
      body: spendingDataset({
        month,
        rows: accountBalances(db, auth, window).filter((r) => r.type === "expense"),
        budgets: budgetsForMonth(db, auth, month),
      }),
    };
  });
}

export type SpendingInput = {
  month: string;
  /** Expense accounts with their activity in the month. */
  rows: readonly AccountBalanceRow[];
  /** Budgeted amount by account id for the month. */
  budgets: ReadonlyMap<number, number>;
};

export function spendingDataset({ month, rows, budgets }: SpendingInput): GridDataset {
  const { from, to } = monthWindow(month);
  const lines = rows.map((row) => {
    const actual = displayBalance("expense", row.balance);
    const budget = budgets.get(row.id) ?? null;
    return {
      id: row.id,
      account: row.name,
      budget,
      actual,
      remaining: budget === null ? null : roundMoney(budget - actual),
      used: budget === null || budget === 0 ? null : actual / budget,
    };
  });

  const totalBudget = roundMoney(
    lines.reduce((sum, line) => sum + (line.budget ?? 0), 0),
  );
  const totalActual = roundMoney(lines.reduce((sum, line) => sum + line.actual, 0));

  return {
    name: "spending",
    label: `Spending against budget, ${month}`,
    rootLevel: "account",
    levels: {
      account: {
        label: "Expense accounts",
        childLevels: [],
        columns: [
          hiddenColumn("account_id", "number"),
          hiddenColumn("period_from", "date"),
          hiddenColumn("period_to", "date"),
          {
            id: "account",
            label: "Expense account",
            kind: "text",
            minWidth: 36,
            links: [
              registerLink({
                account_id: "account_id",
                period_from: "period_from",
                period_to: "period_to",
              }),
            ],
          },
          moneyColumn("budget", "Budget", {
            zeroDisplay: "blank",
            links: [
              {
                kind: "table",
                table: "budgets",
                bind: { account_id: "account_id" },
                label: "Budgets for this account",
              },
            ],
          }),
          moneyColumn("actual", "Spent"),
          moneyColumn("remaining", "Remaining", { colorRule: "signed" }),
          {
            id: "used",
            label: "Used",
            kind: "number",
            displayFormat: "percentage",
            zeroDisplay: "blank",
          },
        ],
      },
    },
    nodes: lines.map((line) => ({
      rowKey: `account:${line.id}`,
      levelName: "account",
      columns: {
        account_id: line.id,
        period_from: from,
        period_to: to,
        account: line.account,
        budget: line.budget,
        actual: line.actual,
        remaining: line.remaining,
        used: line.used,
      },
    })),
    footerRows: [
      {
        rowKey: "total",
        columns: {
          account: "Total",
          budget: totalBudget,
          actual: totalActual,
          remaining: roundMoney(totalBudget - totalActual),
          used: totalBudget === 0 ? null : totalActual / totalBudget,
        },
      },
    ],
  };
}
