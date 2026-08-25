/**
 * The rules of an entry, with no database in sight.
 *
 * An entry arrives in one of four shapes. The three everyday shapes name the
 * accounts on each side and the server derives the postings, so they balance
 * by construction. A journal entry names its postings outright and has to
 * balance on its own. Either way the result is a list of signed postings —
 * positive debits, negative credits — whose sum is zero.
 */
import type { ErrorBody } from "@sapporta/shared/contracts";
import type { FieldIssue } from "@sapporta/shared/validation";
import {
  isBalanceAccountType,
  moneyEquals,
  roundMoney,
  sumMoney,
  type AccountType,
  type EntryBody,
} from "bookkeeping-shared";

export type PostingDraft = {
  account_id: number;
  /** Signed: positive debits the account, negative credits it. */
  amount: number;
};

export abstract class LedgerError extends Error {
  abstract readonly status: 404 | 422;
  abstract readonly payload: ErrorBody;
}

export class TransactionNotFoundError extends LedgerError {
  readonly status = 404 as const;
  readonly payload = {
    error: "Transaction not found",
    code: "TRANSACTION_NOT_FOUND",
  } as const satisfies ErrorBody;

  constructor() {
    super("Transaction not found");
    this.name = "TransactionNotFoundError";
  }
}

/** The entry parsed, but its accounts or amounts do not make a valid entry. */
export class InvalidEntryError extends LedgerError {
  readonly status = 422 as const;
  readonly payload: ErrorBody;

  constructor(readonly issues: readonly FieldIssue[]) {
    super(`Invalid entry: ${issues.map((i) => i.message).join(" ")}`);
    this.name = "InvalidEntryError";
    this.payload = {
      error: issues[0]?.message ?? "The entry is not valid.",
      code: "INVALID_ENTRY",
      details: [...issues],
    };
  }
}

/** Every account the entry names, in field order, for one visibility read. */
export function accountIdsInEntry(entry: EntryBody): number[] {
  switch (entry.kind) {
    case "expense":
      return [entry.from_account_id, ...entry.splits.map((s) => s.account_id)];
    case "income":
      return [entry.to_account_id, ...entry.splits.map((s) => s.account_id)];
    case "transfer":
      return [entry.from_account_id, entry.to_account_id];
    case "journal":
      return entry.lines.map((line) => line.account_id);
  }
}

/**
 * The income or expense account a new payee should remember from this entry:
 * the first category it was filed under. Transfers and journal entries teach
 * a payee nothing.
 */
export function categoryAccountOfEntry(entry: EntryBody): number | null {
  if (entry.kind === "expense" || entry.kind === "income") {
    return entry.splits[0]?.account_id ?? null;
  }
  return null;
}

/**
 * Checks each named account against the role the entry gives it. `typeById`
 * holds only the accounts the caller can see, so an absent id is reported as
 * not found without revealing whether it exists elsewhere.
 */
export function accountRoleIssues(
  entry: EntryBody,
  typeById: ReadonlyMap<number, AccountType>,
): FieldIssue[] {
  const issues: FieldIssue[] = [];

  function expect(
    field: string,
    accountId: number,
    allowed: (type: AccountType) => boolean,
    message: string,
  ) {
    const type = typeById.get(accountId);
    if (type === undefined) {
      issues.push({ field, message: "Account not found." });
    } else if (!allowed(type)) {
      issues.push({ field, message });
    }
  }

  switch (entry.kind) {
    case "expense":
      expect(
        "from_account_id",
        entry.from_account_id,
        isBalanceAccountType,
        "Pay from an asset or liability account.",
      );
      entry.splits.forEach((split, index) =>
        expect(
          `splits.${index}.account_id`,
          split.account_id,
          (type) => type === "expense",
          "Choose an expense account.",
        ),
      );
      break;
    case "income":
      expect(
        "to_account_id",
        entry.to_account_id,
        isBalanceAccountType,
        "Deposit into an asset or liability account.",
      );
      entry.splits.forEach((split, index) =>
        expect(
          `splits.${index}.account_id`,
          split.account_id,
          (type) => type === "income",
          "Choose an income account.",
        ),
      );
      break;
    case "transfer":
      expect(
        "from_account_id",
        entry.from_account_id,
        isBalanceAccountType,
        "Transfer from an asset or liability account.",
      );
      expect(
        "to_account_id",
        entry.to_account_id,
        isBalanceAccountType,
        "Transfer to an asset or liability account.",
      );
      if (entry.from_account_id === entry.to_account_id) {
        issues.push({
          field: "to_account_id",
          message: "Transfer between two different accounts.",
        });
      }
      break;
    case "journal":
      entry.lines.forEach((line, index) =>
        expect(`lines.${index}.account_id`, line.account_id, () => true, ""),
      );
      break;
  }

  return issues;
}

/**
 * Turns an entry into its signed postings and proves they balance. Throws
 * `InvalidEntryError` for a journal entry whose debits and credits differ.
 */
export function postingsForEntry(entry: EntryBody): PostingDraft[] {
  const drafts = rawPostings(entry).map((posting) => ({
    account_id: posting.account_id,
    amount: roundMoney(posting.amount),
  }));

  const zero = drafts.findIndex((posting) => posting.amount === 0);
  if (zero !== -1) {
    throw new InvalidEntryError([
      { field: lineField(entry, zero), message: "Enter an amount." },
    ]);
  }

  const debits = sumMoney(drafts.filter((p) => p.amount > 0).map((p) => p.amount));
  const credits = sumMoney(
    drafts.filter((p) => p.amount < 0).map((p) => -p.amount),
  );
  if (!moneyEquals(debits, credits)) {
    throw new InvalidEntryError([
      {
        field: "lines",
        message: `Debits (${debits.toFixed(2)}) and credits (${credits.toFixed(2)}) must be equal.`,
      },
    ]);
  }

  return drafts;
}

function rawPostings(entry: EntryBody): PostingDraft[] {
  switch (entry.kind) {
    case "expense": {
      const total = sumMoney(entry.splits.map((s) => s.amount));
      return [
        ...entry.splits.map((s) => ({ account_id: s.account_id, amount: s.amount })),
        { account_id: entry.from_account_id, amount: -total },
      ];
    }
    case "income": {
      const total = sumMoney(entry.splits.map((s) => s.amount));
      return [
        { account_id: entry.to_account_id, amount: total },
        ...entry.splits.map((s) => ({ account_id: s.account_id, amount: -s.amount })),
      ];
    }
    case "transfer":
      return [
        { account_id: entry.to_account_id, amount: entry.amount },
        { account_id: entry.from_account_id, amount: -entry.amount },
      ];
    case "journal":
      return entry.lines.map((line) => ({
        account_id: line.account_id,
        amount: line.debit > 0 ? line.debit : -line.credit,
      }));
  }
}

function lineField(entry: EntryBody, postingIndex: number): string {
  switch (entry.kind) {
    case "expense":
      return postingIndex < entry.splits.length
        ? `splits.${postingIndex}.amount`
        : "splits";
    case "income":
      return postingIndex === 0 ? "splits" : `splits.${postingIndex - 1}.amount`;
    case "transfer":
      return "amount";
    case "journal":
      return `lines.${postingIndex}.debit`;
  }
}
