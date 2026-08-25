import { gridDatasetSchema } from "@sapporta/shared/grid-dataset";
import { describe, expect, it } from "vitest";
import { balancesDataset } from "./balances.js";
import { registerDataset } from "./register.js";
import { spendingDataset } from "./spending.js";

describe("balancesDataset", () => {
  it("shows balances in their normal sign and nets assets against liabilities", () => {
    const dataset = gridDatasetSchema.parse(
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
    const dataset = gridDatasetSchema.parse(
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
    const dataset = gridDatasetSchema.parse(
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
