/**
 * One side of a money movement: an amount debited to or credited from one
 * account, belonging to one transaction.
 *
 * `amount` is signed: a positive amount debits the account, a negative amount
 * credits it. The postings of one transaction always sum to zero. That rule is
 * enforced by the entry workflow, which is the only path that writes postings;
 * the table is immutable to the generated API so a single posting cannot be
 * edited or deleted on its own and leave its transaction unbalanced.
 */
import { index, integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { money, sapportaTable, text } from "@sapporta/server/table";
import { accountsTable } from "./accounts.js";
import { transactionsTable } from "./transactions.js";

export const postingsTable = sqliteTable(
  "postings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspace_id: text("workspace_id").notNull(),
    transaction_id: integer("transaction_id")
      .notNull()
      .references(() => transactionsTable.id, { onDelete: "cascade" }),
    account_id: integer("account_id")
      .notNull()
      .references(() => accountsTable.id, { onDelete: "restrict" }),
    amount: money("amount").notNull(),
  },
  (table) => [
    index("postings_account_idx").on(table.workspace_id, table.account_id),
    index("postings_transaction_idx").on(table.transaction_id),
  ],
);

export const postings = sapportaTable({
  drizzle: postingsTable,
  meta: {
    label: "Postings",
    rowScope: "workspaceGlobal",
    rowLabelColumns: ["amount"],
    immutable: true,
    columns: {
      // Authored by the entry workflow; never accepted from a caller.
      transaction_id: { label: "Transaction", apiWritable: false },
      account_id: { label: "Account", minWidth: 28 },
      amount: {
        colorRule: "signed",
        notes: "Positive debits the account; negative credits it.",
      },
    },
  },
  validate(value, context) {
    if (typeof value.amount === "number" && value.amount === 0) {
      context.addIssue("amount", "A posting must move a non-zero amount.");
    }
  },
});

export type Posting = typeof postingsTable.$inferSelect;
export type NewPosting = typeof postingsTable.$inferInsert;

export default postings;
