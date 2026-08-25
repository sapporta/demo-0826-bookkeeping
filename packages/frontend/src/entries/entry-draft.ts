// What the entry form holds while a person types, and how that becomes the
// entry the server records. The draft keeps raw text in amount boxes; the
// conversion parses once at submit and reports issues by the same field names
// the server uses, so local and server issues land on the same controls.

import type { FieldIssue } from "@sapporta/shared/validation";
import {
  isBalanceAccountType,
  isoDateSchema,
  roundMoney,
  sumMoney,
  type AccountType,
  type EntryBody,
  type EntryKind,
  type TransactionDetail,
} from "bookkeeping-shared";
import { amountText, parseAmount } from "./money";

export type PayeeChoice =
  | { id: number; label: string }
  | { name: string }
  | null;

export type SplitDraft = { account_id: number | null; amount: string };

export type LineDraft = {
  account_id: number | null;
  debit: string;
  credit: string;
};

export type EntryDraft = {
  kind: EntryKind;
  date: string;
  payee: PayeeChoice;
  memo: string;
  from_account_id: number | null;
  to_account_id: number | null;
  amount: string;
  splits: SplitDraft[];
  lines: LineDraft[];
};

export const emptySplit = (): SplitDraft => ({ account_id: null, amount: "" });
export const emptyLine = (): LineDraft => ({
  account_id: null,
  debit: "",
  credit: "",
});

export function emptyDraft(date: string, kind: EntryKind = "expense"): EntryDraft {
  return {
    kind,
    date,
    payee: null,
    memo: "",
    from_account_id: null,
    to_account_id: null,
    amount: "",
    splits: [emptySplit()],
    lines: [emptyLine(), emptyLine()],
  };
}

/**
 * Reads a stored transaction back into the shape it was most likely entered
 * in, so an expense reopens as an expense. Anything that fits none of the
 * everyday shapes reopens as a journal entry, which can express it exactly.
 */
export function draftFromTransaction(
  detail: TransactionDetail,
  typeById: ReadonlyMap<number, AccountType>,
): EntryDraft {
  const base = emptyDraft(detail.date, "journal");
  base.payee =
    detail.payee_id === null
      ? null
      : { id: detail.payee_id, label: detail.payee_name ?? "" };
  base.memo = detail.memo ?? "";

  const isBalance = (id: number) => {
    const type = typeById.get(id);
    return type !== undefined && isBalanceAccountType(type);
  };
  const positives = detail.postings.filter((p) => p.amount > 0);
  const negatives = detail.postings.filter((p) => p.amount < 0);

  if (
    detail.postings.length === 2 &&
    positives.length === 1 &&
    negatives.length === 1 &&
    detail.postings.every((p) => isBalance(p.account_id))
  ) {
    const [to] = positives;
    const [from] = negatives;
    return {
      ...base,
      kind: "transfer",
      from_account_id: from?.account_id ?? null,
      to_account_id: to?.account_id ?? null,
      amount: amountText(to?.amount ?? 0),
    };
  }

  if (
    negatives.length === 1 &&
    positives.length >= 1 &&
    isBalance(negatives[0]!.account_id) &&
    positives.every((p) => typeById.get(p.account_id) === "expense")
  ) {
    return {
      ...base,
      kind: "expense",
      from_account_id: negatives[0]!.account_id,
      splits: positives.map((p) => ({
        account_id: p.account_id,
        amount: amountText(p.amount),
      })),
    };
  }

  if (
    positives.length === 1 &&
    negatives.length >= 1 &&
    isBalance(positives[0]!.account_id) &&
    negatives.every((p) => typeById.get(p.account_id) === "income")
  ) {
    return {
      ...base,
      kind: "income",
      to_account_id: positives[0]!.account_id,
      splits: negatives.map((p) => ({
        account_id: p.account_id,
        amount: amountText(-p.amount),
      })),
    };
  }

  return {
    ...base,
    kind: "journal",
    lines: detail.postings.map((p) => ({
      account_id: p.account_id,
      debit: p.amount > 0 ? amountText(p.amount) : "",
      credit: p.amount < 0 ? amountText(-p.amount) : "",
    })),
  };
}

export type DraftParse =
  | { ok: true; body: EntryBody }
  | { ok: false; issues: FieldIssue[] };

export function entryBodyFromDraft(draft: EntryDraft): DraftParse {
  const issues: FieldIssue[] = [];
  const issue = (field: string, message: string) => issues.push({ field, message });

  if (!isoDateSchema.safeParse(draft.date).success) {
    issue("date", "Enter the day this happened.");
  }
  const payee =
    draft.payee === null
      ? null
      : "id" in draft.payee
        ? { id: draft.payee.id }
        : { name: draft.payee.name };
  const header = { date: draft.date, payee, memo: draft.memo.trim() };

  const account = (field: string, id: number | null): number => {
    if (id === null) issue(field, "Choose an account.");
    return id ?? 0;
  };
  const positive = (field: string, text: string): number => {
    const value = parseAmount(text);
    if (value === null) {
      issue(field, "Enter an amount.");
      return 0;
    }
    if (value <= 0) {
      issue(field, "Enter an amount above zero.");
      return 0;
    }
    return roundMoney(value);
  };
  const splits = () => {
    if (draft.splits.length === 0) issue("splits", "Add at least one line.");
    return draft.splits.map((split, index) => ({
      account_id: account(`splits.${index}.account_id`, split.account_id),
      amount: positive(`splits.${index}.amount`, split.amount),
    }));
  };

  let body: EntryBody;
  switch (draft.kind) {
    case "expense":
      body = {
        kind: "expense",
        ...header,
        from_account_id: account("from_account_id", draft.from_account_id),
        splits: splits(),
      };
      break;
    case "income":
      body = {
        kind: "income",
        ...header,
        to_account_id: account("to_account_id", draft.to_account_id),
        splits: splits(),
      };
      break;
    case "transfer":
      body = {
        kind: "transfer",
        ...header,
        from_account_id: account("from_account_id", draft.from_account_id),
        to_account_id: account("to_account_id", draft.to_account_id),
        amount: positive("amount", draft.amount),
      };
      if (
        draft.from_account_id !== null &&
        draft.from_account_id === draft.to_account_id
      ) {
        issue("to_account_id", "Transfer between two different accounts.");
      }
      break;
    case "journal": {
      if (draft.lines.length < 2) issue("lines", "A journal entry needs at least two lines.");
      const lines = draft.lines.map((line, index) => {
        const debit = parseAmount(line.debit) ?? 0;
        const credit = parseAmount(line.credit) ?? 0;
        if (debit < 0 || credit < 0) {
          issue(`lines.${index}.debit`, "Amounts cannot be negative.");
        } else if ((debit > 0) === (credit > 0)) {
          issue(`lines.${index}.debit`, "Enter either a debit or a credit.");
        }
        return {
          account_id: account(`lines.${index}.account_id`, line.account_id),
          debit: roundMoney(debit),
          credit: roundMoney(credit),
        };
      });
      const totals = journalTotals(draft.lines);
      if (issues.length === 0 && totals.difference !== 0) {
        issue(
          "lines",
          `Debits (${totals.debits.toFixed(2)}) and credits (${totals.credits.toFixed(2)}) must be equal.`,
        );
      }
      body = { kind: "journal", ...header, lines };
      break;
    }
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, body };
}

export function splitsTotal(splits: readonly SplitDraft[]): number {
  return sumMoney(splits.map((split) => parseAmount(split.amount) ?? 0));
}

export function journalTotals(lines: readonly LineDraft[]) {
  const debits = sumMoney(lines.map((line) => parseAmount(line.debit) ?? 0));
  const credits = sumMoney(lines.map((line) => parseAmount(line.credit) ?? 0));
  return { debits, credits, difference: roundMoney(debits - credits) };
}

/** `splits.0.amount` on the wire is `splits[0].amount` to the form. */
export function draftFieldForIssue(field: string): string {
  return field.replace(/\.(\d+)(?=\.|$)/g, "[$1]");
}
