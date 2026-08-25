// The chart-of-accounts vocabulary shared by the schema, the entry workflow,
// and the browser.

import { z } from "zod";

export const ACCOUNT_TYPES = [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const accountTypeSchema = z.enum(ACCOUNT_TYPES);

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  income: "Income",
  expense: "Expenses",
};

/**
 * Accounts whose balance is money the household holds or owes: the "from"
 * side of an expense, the "to" side of income, both sides of a transfer.
 */
export const BALANCE_ACCOUNT_TYPES = ["asset", "liability"] as const;

/** Accounts that act as categories. */
export const CATEGORY_ACCOUNT_TYPES = ["income", "expense"] as const;

export type BalanceAccountType = (typeof BALANCE_ACCOUNT_TYPES)[number];
export type CategoryAccountType = (typeof CATEGORY_ACCOUNT_TYPES)[number];

export function isBalanceAccountType(type: AccountType): type is BalanceAccountType {
  return (BALANCE_ACCOUNT_TYPES as readonly AccountType[]).includes(type);
}

export function isCategoryAccountType(type: AccountType): type is CategoryAccountType {
  return (CATEGORY_ACCOUNT_TYPES as readonly AccountType[]).includes(type);
}

/**
 * Whether a positive balance for this account type is normally a debit
 * (assets, expenses) or a credit (liabilities, equity, income). Reports show
 * balances in their normal sign so a savings account and a credit-card debt
 * both read as positive numbers.
 */
export function normalBalanceSign(type: AccountType): 1 | -1 {
  return type === "asset" || type === "expense" ? 1 : -1;
}

/** The `accounts` columns the entry form and pickers read. */
export const accountRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: accountTypeSchema,
});

export type AccountRow = z.output<typeof accountRowSchema>;

/** The `payees` columns the entry form reads to auto-categorize. */
export const payeeRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  default_account_id: z.number().nullable(),
});

export type PayeeRow = z.output<typeof payeeRowSchema>;
