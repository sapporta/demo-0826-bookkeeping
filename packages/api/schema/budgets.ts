/**
 * How much the household plans to spend from one expense account in one
 * calendar month. The Spending report compares each budget with the postings
 * actually filed under that account in the month.
 */
import { desc } from "drizzle-orm";
import { integer, sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import { money, sapportaTable, text } from "@sapporta/server/table";
import { monthSchema } from "bookkeeping-shared";
import { accountsTable } from "./accounts.js";

export const budgetsTable = sqliteTable(
  "budgets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspace_id: text("workspace_id").notNull(),
    account_id: integer("account_id")
      .notNull()
      .references(() => accountsTable.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    amount: money("amount").notNull(),
  },
  (table) => [
    uniqueIndex("budgets_account_month_idx").on(
      table.workspace_id,
      table.account_id,
      table.month,
    ),
  ],
);

export const budgets = sapportaTable({
  drizzle: budgetsTable,
  meta: {
    label: "Budgets",
    rowScope: "workspaceGlobal",
    rowLabelColumns: ["month"],
    defaultSort: desc(budgetsTable.month),
    columns: {
      account_id: {
        label: "Expense account",
        minWidth: 28,
        notes: "Budgets apply to expense accounts.",
      },
      month: { width: 10, notes: "Calendar month as YYYY-MM." },
    },
  },
  validate(value, context) {
    if (
      typeof value.month === "string" &&
      !monthSchema.safeParse(value.month).success
    ) {
      context.addIssue("month", "Month must be written as YYYY-MM.");
    }
    if (typeof value.amount === "number" && value.amount < 0) {
      context.addIssue("amount", "A budget cannot be negative.");
    }
  },
});

export type Budget = typeof budgetsTable.$inferSelect;
export type NewBudget = typeof budgetsTable.$inferInsert;

export default budgets;
