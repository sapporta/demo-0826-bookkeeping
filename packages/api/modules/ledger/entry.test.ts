import { describe, expect, it } from "vitest";
import type { EntryBody } from "bookkeeping-shared";
import {
  accountRoleIssues,
  categoryAccountOfEntry,
  InvalidEntryError,
  postingsForEntry,
} from "./entry.js";

const types = new Map([
  [1, "asset" as const],
  [2, "liability" as const],
  [3, "expense" as const],
  [4, "expense" as const],
  [5, "income" as const],
  [6, "equity" as const],
]);

describe("postingsForEntry", () => {
  it("credits the funding account for the total of an expense split", () => {
    const entry: EntryBody = {
      kind: "expense",
      date: "2026-08-01",
      payee: null,
      memo: "",
      from_account_id: 1,
      splits: [
        { account_id: 3, amount: 0.1 },
        { account_id: 4, amount: 0.2 },
      ],
    };
    expect(postingsForEntry(entry)).toEqual([
      { account_id: 3, amount: 0.1 },
      { account_id: 4, amount: 0.2 },
      { account_id: 1, amount: -0.3 },
    ]);
  });

  it("debits the deposit account for income", () => {
    const entry: EntryBody = {
      kind: "income",
      date: "2026-08-01",
      payee: null,
      memo: "",
      to_account_id: 1,
      splits: [{ account_id: 5, amount: 2500 }],
    };
    expect(postingsForEntry(entry)).toEqual([
      { account_id: 1, amount: 2500 },
      { account_id: 5, amount: -2500 },
    ]);
  });

  it("moves a transfer from one balance account to another", () => {
    const entry: EntryBody = {
      kind: "transfer",
      date: "2026-08-01",
      payee: null,
      memo: "",
      from_account_id: 1,
      to_account_id: 2,
      amount: 300,
    };
    expect(postingsForEntry(entry)).toEqual([
      { account_id: 2, amount: 300 },
      { account_id: 1, amount: -300 },
    ]);
  });

  it("accepts a balanced journal entry and rejects an unbalanced one", () => {
    const balanced: EntryBody = {
      kind: "journal",
      date: "2026-08-01",
      payee: null,
      memo: "",
      lines: [
        { account_id: 1, debit: 100, credit: 0 },
        { account_id: 6, debit: 0, credit: 100 },
      ],
    };
    expect(postingsForEntry(balanced)).toEqual([
      { account_id: 1, amount: 100 },
      { account_id: 6, amount: -100 },
    ]);

    const unbalanced: EntryBody = {
      ...balanced,
      lines: [
        { account_id: 1, debit: 100, credit: 0 },
        { account_id: 6, debit: 0, credit: 90 },
      ],
    };
    expect(() => postingsForEntry(unbalanced)).toThrow(InvalidEntryError);
  });
});

describe("accountRoleIssues", () => {
  it("requires a balance account to pay from and expense accounts to file under", () => {
    const issues = accountRoleIssues(
      {
        kind: "expense",
        date: "2026-08-01",
        payee: null,
        memo: "",
        from_account_id: 3,
        splits: [
          { account_id: 5, amount: 10 },
          { account_id: 99, amount: 10 },
        ],
      },
      types,
    );
    expect(issues).toEqual([
      { field: "from_account_id", message: "Pay from an asset or liability account." },
      { field: "splits.0.account_id", message: "Choose an expense account." },
      { field: "splits.1.account_id", message: "Account not found." },
    ]);
  });

  it("rejects a transfer to the same account", () => {
    const issues = accountRoleIssues(
      {
        kind: "transfer",
        date: "2026-08-01",
        payee: null,
        memo: "",
        from_account_id: 1,
        to_account_id: 1,
        amount: 5,
      },
      types,
    );
    expect(issues.map((i) => i.field)).toEqual(["to_account_id"]);
  });
});

describe("categoryAccountOfEntry", () => {
  it("remembers the first category of an expense and nothing for a transfer", () => {
    expect(
      categoryAccountOfEntry({
        kind: "expense",
        date: "2026-08-01",
        payee: null,
        memo: "",
        from_account_id: 1,
        splits: [{ account_id: 4, amount: 1 }],
      }),
    ).toBe(4);
    expect(
      categoryAccountOfEntry({
        kind: "transfer",
        date: "2026-08-01",
        payee: null,
        memo: "",
        from_account_id: 1,
        to_account_id: 2,
        amount: 1,
      }),
    ).toBeNull();
  });
});
