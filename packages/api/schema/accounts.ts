/**
 * The chart of accounts.
 *
 * Every account has one of the five double-entry types. Income and expense
 * accounts double as the categories a transaction is filed under, so there is
 * no separate category table: "Groceries" is an expense account, "Salary" an
 * income account.
 *
 * Rows are workspace-global: a workspace is one set of books, and every member
 * of it keeps the same books.
 */
import { asc, sql } from "drizzle-orm";
import { integer, sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sapportaTable, select, text } from "@sapporta/server/table";
import { ACCOUNT_TYPES } from "bookkeeping-shared";

export const accountsTable = sqliteTable(
  "accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspace_id: text("workspace_id").notNull(),
    name: text("name").notNull(),
    type: select("type", ACCOUNT_TYPES).notNull(),
  },
  (table) => [
    uniqueIndex("accounts_workspace_name_idx").on(
      table.workspace_id,
      sql`lower(${table.name})`,
    ),
  ],
);

export const accounts = sapportaTable({
  drizzle: accountsTable,
  meta: {
    label: "Accounts",
    rowScope: "workspaceGlobal",
    rowLabelColumns: ["name"],
    defaultSort: asc(accountsTable.name),
    columns: {
      name: { minWidth: 32 },
      type: {
        minWidth: 14,
        notes:
          "Asset, liability, and equity accounts hold balances. Income and expense accounts are the categories entries are filed under.",
      },
    },
    rowLinks: [
      {
        kind: "report",
        report: "register",
        bind: { account_id: "id" },
        label: "Account register",
      },
    ],
    children: [
      {
        table: "postings",
        foreignKey: "account_id",
        label: "Postings",
        columns: ["transaction_id", "amount"],
        defaultSort: "-id",
      },
      {
        table: "budgets",
        foreignKey: "account_id",
        label: "Budgets",
        columns: ["month", "amount"],
        defaultSort: "-month",
      },
    ],
  },
  validate(value, context) {
    if (typeof value.name === "string" && value.name.trim() === "") {
      context.addIssue("name", "Account name is required.");
    }
  },
});

export type Account = typeof accountsTable.$inferSelect;
export type NewAccount = typeof accountsTable.$inferInsert;

export default accounts;
