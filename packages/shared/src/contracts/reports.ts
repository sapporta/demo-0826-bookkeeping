// Report routes. Each returns a GridDataset the report renderer draws; the
// screen owns its parameters and URL state.

import { z } from "zod";
import { initContract } from "@sapporta/rest-core";
import { RELATIVE_DURATIONS } from "@sapporta/shared/daterange";
import { errorBodySchema } from "@sapporta/shared/contracts";
import { gridDatasetSchema } from "@sapporta/shared/grid-dataset";
import { isoDateSchema, monthSchema } from "./ledger.js";

const c = initContract();

/** The three URL keys `resolveDateRangeQueryBounds("period", ...)` reads. */
const periodQuery = {
  period_relative: z.enum(RELATIVE_DURATIONS).optional(),
  period_from: z.string().optional(),
  period_to: z.string().optional(),
};

export const balancesQuerySchema = z.object({
  as_of: isoDateSchema.optional(),
});
export type BalancesQuery = z.output<typeof balancesQuerySchema>;

export const cashFlowQuerySchema = z.object(periodQuery);
export type CashFlowQuery = z.output<typeof cashFlowQuerySchema>;

export const spendingQuerySchema = z.object({
  month: monthSchema.optional(),
});
export type SpendingQuery = z.output<typeof spendingQuerySchema>;

export const registerQuerySchema = z.object({
  account_id: z.coerce.number().int().positive(),
  ...periodQuery,
});
export type RegisterQuery = z.output<typeof registerQuerySchema>;

export const journalQuerySchema = z.object(periodQuery);
export type JournalQuery = z.output<typeof journalQuerySchema>;

const reportResponses = {
  200: gridDatasetSchema,
  400: errorBodySchema,
};

export const reportsContract = c.router({
  balances: c.query({
    method: "GET",
    path: "/reports/balances",
    summary: "Account balances as of a day",
    metadata: { tags: ["reports"] },
    query: balancesQuerySchema,
    responses: reportResponses,
  }),
  cashFlow: c.query({
    method: "GET",
    path: "/reports/cash-flow",
    summary: "Income and expenses over a period",
    metadata: { tags: ["reports"] },
    query: cashFlowQuerySchema,
    responses: reportResponses,
  }),
  spending: c.query({
    method: "GET",
    path: "/reports/spending",
    summary: "Spending against budget for a month",
    metadata: { tags: ["reports"] },
    query: spendingQuerySchema,
    responses: reportResponses,
  }),
  register: c.query({
    method: "GET",
    path: "/reports/register",
    summary: "One account's postings with a running balance",
    metadata: { tags: ["reports"] },
    query: registerQuerySchema,
    responses: { ...reportResponses, 404: errorBodySchema },
  }),
  journal: c.query({
    method: "GET",
    path: "/reports/journal",
    summary: "Transactions with their postings over a period",
    metadata: { tags: ["reports"] },
    query: journalQuerySchema,
    responses: reportResponses,
  }),
});
