/**
 * A transaction is a thin header over two or more balanced postings: the day
 * it happened, who it was with, and a note. The money movement itself lives in
 * `postings`.
 *
 * Entries are recorded and edited through the app's entry form, which writes
 * the header and its postings in one transaction. The generated table page is
 * for inspection.
 */
import { desc } from "drizzle-orm";
import { index, integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { date, sapportaTable, text } from "@sapporta/server/table";
import { payeesTable } from "./payees.js";

export const transactionsTable = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspace_id: text("workspace_id").notNull(),
    date: date("date").notNull(),
    payee_id: integer("payee_id").references(() => payeesTable.id, {
      onDelete: "set null",
    }),
    memo: text("memo"),
  },
  (table) => [
    index("transactions_workspace_date_idx").on(table.workspace_id, table.date),
  ],
);

export const transactions = sapportaTable({
  drizzle: transactionsTable,
  meta: {
    label: "Transactions",
    rowScope: "workspaceGlobal",
    rowLabelColumns: ["date", "memo"],
    defaultSort: desc(transactionsTable.date),
    columns: {
      payee_id: { label: "Payee", minWidth: 28 },
      memo: { minWidth: 40 },
    },
    rowLinks: [
      {
        kind: "url",
        href: "/transactions/{id}/edit",
        label: "Edit entry",
        icon: "drill-into",
      },
    ],
    children: [
      {
        table: "postings",
        foreignKey: "transaction_id",
        label: "Postings",
        columns: ["account_id", "amount"],
        defaultSort: "id",
      },
    ],
  },
});

export type Transaction = typeof transactionsTable.$inferSelect;
export type NewTransaction = typeof transactionsTable.$inferInsert;

export default transactions;
