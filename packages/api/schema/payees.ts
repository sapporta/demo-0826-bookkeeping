/**
 * Who money went to or came from.
 *
 * A payee remembers the income or expense account it usually belongs to, so a
 * new entry for that payee starts out already categorized.
 */
import { asc } from "drizzle-orm";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { sapportaTable, text } from "@sapporta/server/table";
import { accountsTable } from "./accounts.js";

export const payeesTable = sqliteTable("payees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspace_id: text("workspace_id").notNull(),
  name: text("name").notNull(),
  default_account_id: integer("default_account_id").references(
    () => accountsTable.id,
    { onDelete: "set null" },
  ),
});

export const payees = sapportaTable({
  drizzle: payeesTable,
  meta: {
    label: "Payees",
    rowScope: "workspaceGlobal",
    rowLabelColumns: ["name"],
    defaultSort: asc(payeesTable.name),
    columns: {
      name: { minWidth: 32 },
      default_account_id: {
        label: "Default account",
        minWidth: 28,
        notes:
          "The income or expense account a new entry for this payee is filed under.",
      },
    },
    children: [
      {
        table: "transactions",
        foreignKey: "payee_id",
        label: "Transactions",
        columns: ["date", "memo"],
        defaultSort: "-date",
      },
    ],
  },
  validate(value, context) {
    if (typeof value.name === "string" && value.name.trim() === "") {
      context.addIssue("name", "Payee name is required.");
    }
  },
});

export type Payee = typeof payeesTable.$inferSelect;
export type NewPayee = typeof payeesTable.$inferInsert;

export default payees;
