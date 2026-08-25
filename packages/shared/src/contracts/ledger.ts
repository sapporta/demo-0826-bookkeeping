// The entry workflow: one typed operation records, edits, or removes a
// transaction with its balanced postings. The server derives the postings for
// the three everyday shapes and checks that a journal entry balances.

import { z } from "zod";
import { initContract } from "@sapporta/rest-core";
import { errorBodySchema } from "@sapporta/shared/contracts";

const c = initContract();

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar day as YYYY-MM-DD.");

/** A calendar month as `YYYY-MM`: what a budget covers and Spending reads. */
export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a calendar month as YYYY-MM.");

const recordId = z.number().int().positive();
const positiveAmount = z.number().finite().positive();
const nonNegativeAmount = z.number().finite().nonnegative();

/**
 * Who the entry was with. An existing payee by id, a new payee by name that
 * the server creates on the way through, or nobody.
 */
export const payeeRefSchema = z
  .union([
    z.object({ id: recordId }),
    z.object({ name: z.string().trim().min(1).max(120) }),
  ])
  .nullable();

export type PayeeRef = z.output<typeof payeeRefSchema>;

const entryHeader = {
  date: isoDateSchema,
  payee: payeeRefSchema,
  memo: z.string().trim().max(500),
};

/** One category line of an expense or income entry. */
export const entrySplitSchema = z.object({
  account_id: recordId,
  amount: positiveAmount,
});

export type EntrySplit = z.output<typeof entrySplitSchema>;

/** One line of a general journal entry. Exactly one side carries an amount. */
export const journalLineSchema = z
  .object({
    account_id: recordId,
    debit: nonNegativeAmount,
    credit: nonNegativeAmount,
  })
  .refine((line) => (line.debit > 0) !== (line.credit > 0), {
    message: "Enter either a debit or a credit on each line.",
  });

export type JournalLine = z.output<typeof journalLineSchema>;

export const ENTRY_KINDS = ["expense", "income", "transfer", "journal"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export const entryBodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("expense"),
    ...entryHeader,
    from_account_id: recordId,
    splits: z.array(entrySplitSchema).min(1).max(20),
  }),
  z.object({
    kind: z.literal("income"),
    ...entryHeader,
    to_account_id: recordId,
    splits: z.array(entrySplitSchema).min(1).max(20),
  }),
  z.object({
    kind: z.literal("transfer"),
    ...entryHeader,
    from_account_id: recordId,
    to_account_id: recordId,
    amount: positiveAmount,
  }),
  z.object({
    kind: z.literal("journal"),
    ...entryHeader,
    lines: z.array(journalLineSchema).min(2).max(40),
  }),
]);

export type EntryBody = z.output<typeof entryBodySchema>;

export const entryResultSchema = z.object({
  transaction_id: z.number(),
  payee_id: z.number().nullable(),
});

export type EntryResult = z.output<typeof entryResultSchema>;

/** A stored transaction with its postings, as the edit form loads it. */
export const transactionDetailSchema = z.object({
  id: z.number(),
  date: isoDateSchema,
  payee_id: z.number().nullable(),
  payee_name: z.string().nullable(),
  memo: z.string().nullable(),
  postings: z.array(
    z.object({
      id: z.number(),
      account_id: z.number(),
      /** Signed: positive debits the account, negative credits it. */
      amount: z.number(),
    }),
  ),
});

export type TransactionDetail = z.output<typeof transactionDetailSchema>;

const transactionParams = z.object({ id: z.coerce.number().int().positive() });

export const ledgerContract = c.router({
  createEntry: c.mutation({
    method: "POST",
    path: "/transactions",
    summary: "Record an expense, income, transfer, or journal entry",
    metadata: { tags: ["ledger"] },
    body: entryBodySchema,
    responses: {
      201: entryResultSchema,
      422: errorBodySchema,
    },
  }),
  getTransaction: c.query({
    method: "GET",
    path: "/transactions/:id",
    summary: "Read one transaction with its postings",
    metadata: { tags: ["ledger"] },
    pathParams: transactionParams,
    responses: {
      200: transactionDetailSchema,
      404: errorBodySchema,
    },
  }),
  replaceEntry: c.mutation({
    method: "PUT",
    path: "/transactions/:id",
    summary: "Replace a transaction and its postings",
    metadata: { tags: ["ledger"] },
    pathParams: transactionParams,
    body: entryBodySchema,
    responses: {
      200: entryResultSchema,
      404: errorBodySchema,
      422: errorBodySchema,
    },
  }),
  deleteTransaction: c.mutation({
    method: "DELETE",
    path: "/transactions/:id",
    summary: "Delete a transaction and its postings",
    metadata: { tags: ["ledger"] },
    pathParams: transactionParams,
    body: z.object({}).optional(),
    responses: {
      200: z.object({ transaction_id: z.number() }),
      404: errorBodySchema,
    },
  }),
});
