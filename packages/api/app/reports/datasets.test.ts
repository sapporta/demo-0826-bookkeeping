import {
  gridDatasetLinkProblems,
  gridDatasetSchema,
  type GridDataset,
} from "@sapporta/shared/grid-dataset";
import { describe, expect, it } from "vitest";
import { accountMonthsDataset } from "./account-months.js";
import { balancesDataset } from "./balances.js";
import { profitLossDataset } from "./profit-loss.js";
import { registerDataset } from "./register.js";
import { spendingDataset } from "./spending.js";

/**
 * A dataset as the grid receives it: the shape parsed, and every declarative
 * link checked against the columns its level actually has. A bind naming a
 * column that is not there withholds the link on every row, which looks the
 * same as a legitimately empty cell.
 */
function asGrid(value: GridDataset): GridDataset {
  const parsed = gridDatasetSchema.parse(value);
  expect(gridDatasetLinkProblems(parsed)).toEqual([]);
  return parsed;
}

describe("balancesDataset", () => {
  it("shows balances in their normal sign and nets assets against liabilities", () => {
    const dataset = asGrid(
      balancesDataset({
        asOf: "2026-08-25",
        rows: [
          { id: 1, name: "Checking", type: "asset", balance: 1200.5 },
          { id: 2, name: "Credit card", type: "liability", balance: -300 },
          { id: 3, name: "Salary", type: "income", balance: -5000 },
        ],
      }),
    );
    expect(dataset.nodes.map((n) => n.rowKey)).toEqual([
      "type:asset",
      "type:liability",
      "type:income",
    ]);
    expect(dataset.nodes[1]?.columns.balance).toBe(300);
    expect(dataset.nodes[1]?.children?.account?.[0]?.columns).toMatchObject({
      account_id: 2,
      balance: 300,
      period_to: "2026-08-25",
    });
    expect(dataset.footerRows?.[0]?.columns.balance).toBe(900.5);
  });
});

describe("registerDataset", () => {
  it("runs the balance from the opening row through each posting", () => {
    const dataset = asGrid(
      registerDataset({
        account: { id: 2, name: "Credit card", type: "liability" },
        opening: -100,
        from: "2026-08-01",
        to: "2026-08-31",
        rows: [
          { posting_id: 10, transaction_id: 5, date: "2026-08-02", payee: "Shop", memo: null, amount: -40 },
          { posting_id: 11, transaction_id: 6, date: "2026-08-10", payee: null, memo: "Payment", amount: 140 },
        ],
      }),
    );
    expect(dataset.nodes.map((n) => n.columns.balance)).toEqual([100, 140, 0, 0]);
    expect(dataset.nodes[1]?.columns).toMatchObject({ credit: 40, debit: null, transaction_id: 5 });
    expect(dataset.nodes[0]?.kind).toBe("opening");
    expect(dataset.nodes.at(-1)?.kind).toBe("closing");
    expect(dataset.footerRows?.[0]?.columns).toMatchObject({ debit: 140, credit: 40 });
  });
});

describe("spendingDataset", () => {
  it("compares budget with actual and reports the ratio used", () => {
    const dataset = asGrid(
      spendingDataset({
        month: "2026-08",
        rows: [
          { id: 7, name: "Groceries", type: "expense", balance: 320 },
          { id: 8, name: "Fuel", type: "expense", balance: 0 },
        ],
        budgets: new Map([[7, 400]]),
      }),
    );
    expect(dataset.nodes[0]?.columns).toMatchObject({
      account_id: 7,
      budget: 400,
      actual: 320,
      remaining: 80,
      used: 0.8,
      period_from: "2026-08-01",
      period_to: "2026-08-31",
    });
    expect(dataset.nodes[1]?.columns).toMatchObject({ budget: null, used: null });
    expect(dataset.footerRows?.[0]?.columns).toMatchObject({ budget: 400, actual: 320 });
  });
});

describe("accountMonthsDataset", () => {
  const travel = { id: 9, name: "Travel", type: "expense" } as const;

  it("shows every month the window covers and each month's share of it", () => {
    const dataset = asGrid(
      accountMonthsDataset({
        account: travel,
        from: "2026-01-01",
        to: "2026-03-31",
        rows: [
          { month: "2026-01", entries: 2, debits: 400, credits: 0, amount: 400 },
          { month: "2026-03", entries: 1, debits: 100, credits: 0, amount: 100 },
        ],
      }),
    );
    expect(dataset.nodes.map((n) => n.columns.month)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    expect(dataset.nodes[0]?.columns).toMatchObject({
      account_id: 9,
      entries: 2,
      amount: 400,
      share: 0.8,
      period_from: "2026-01-01",
      period_to: "2026-01-31",
    });
    expect(dataset.nodes[1]?.columns).toMatchObject({ entries: 0, amount: 0, share: 0 });
    expect(dataset.footerRows?.[0]?.columns).toMatchObject({ entries: 3, amount: 500 });
    // A total row's share of itself says nothing, so it is left off.
    expect(dataset.footerRows?.[0]?.columns.share).toBeUndefined();
  });

  it("hands a partly covered month only the days the window counted", () => {
    const dataset = asGrid(
      accountMonthsDataset({
        account: travel,
        from: "2026-01-20",
        to: "2026-02-10",
        rows: [{ month: "2026-01", entries: 1, debits: 60, credits: 0, amount: 60 }],
      }),
    );
    expect(dataset.nodes[0]?.columns).toMatchObject({
      period_from: "2026-01-20",
      period_to: "2026-01-31",
    });
    expect(dataset.nodes[1]?.columns).toMatchObject({
      period_from: "2026-02-01",
      period_to: "2026-02-10",
    });
  });

  it("reads a liability's month in the sign a person expects", () => {
    const dataset = asGrid(
      accountMonthsDataset({
        account: { id: 4, name: "Credit card", type: "liability" },
        from: "2026-01-01",
        to: "2026-01-31",
        rows: [{ month: "2026-01", entries: 3, debits: 200, credits: 500, amount: -300 }],
      }),
    );
    expect(dataset.nodes[0]?.columns).toMatchObject({
      debits: 200,
      credits: 500,
      amount: 300,
    });
  });
});

describe("accountMonthsDataset share", () => {
  it("measures a two-directional account against its gross movement", () => {
    const dataset = asGrid(
      accountMonthsDataset({
        account: { id: 4, name: "Credit card", type: "liability" },
        from: "2026-01-01",
        to: "2026-02-28",
        rows: [
          { month: "2026-01", entries: 4, debits: 0, credits: 900, amount: -900 },
          { month: "2026-02", entries: 2, debits: 800, credits: 0, amount: 800 },
        ],
      }),
    );
    // Normal sign flips both: the month that grew the debt reads +900.
    expect(dataset.nodes.map((n) => n.columns.share)).toEqual([900 / 1700, -800 / 1700]);
  });
});

describe("profitLossDataset", () => {
  const rows = [
    { id: 7, name: "Salary", type: "income" as const, balance: -5000 },
    { id: 9, name: "Travel", type: "expense" as const, balance: 2330.95 },
  ];

  it("groups income and expenses, nets them, and hands each account the period", () => {
    const parsed = asGrid(
      profitLossDataset({ rows, from: "2025-08-28", to: "2026-08-28" }),
    );
    expect(parsed.nodes.map((n) => n.rowKey)).toEqual(["type:income", "type:expense"]);
    expect(parsed.nodes[1]?.children?.account?.[0]?.columns).toMatchObject({
      account_id: 9,
      amount: 2330.95,
      period_from: "2025-08-28",
      period_to: "2026-08-28",
    });
    expect(parsed.footerRows?.[0]?.columns.amount).toBe(2669.05);
  });

  it("carries the window into the drill-down when it has edges", () => {
    const parsed = asGrid(
      profitLossDataset({ rows, from: "2025-08-28", to: "2026-08-28" }),
    );
    expect(accountLink(parsed)?.bind).toEqual({
      account_id: "account_id",
      period_from: "period_from",
      period_to: "period_to",
    });
  });

  it("binds no edge the window does not have", () => {
    const parsed = asGrid(profitLossDataset({ rows, from: null, to: null }));
    // Binding a null column would withhold the drill-down on every row.
    expect(accountLink(parsed)?.bind).toEqual({ account_id: "account_id" });
  });

  function accountLink(parsed: GridDataset) {
    const column = parsed.levels.account?.columns.find((c) => c.id === "account");
    return column?.links?.[0];
  }
});
