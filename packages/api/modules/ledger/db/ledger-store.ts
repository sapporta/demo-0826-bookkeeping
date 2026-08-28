/**
 * Every read and write the ledger makes, each scoped to the caller's rows.
 *
 * A guard is created for every table a query touches, and the guard's
 * predicate is applied to that table's relation before anything is joined,
 * grouped, or summed. Reports read through here; the entry workflow writes
 * through here inside its own transaction.
 */
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { SapportaAuthContext } from "@sapporta/server";
import type { AccountType } from "bookkeeping-shared";
import { accounts, accountsTable } from "../../../schema/accounts.js";
import { budgets, budgetsTable } from "../../../schema/budgets.js";
import { payees, payeesTable } from "../../../schema/payees.js";
import { postings, postingsTable } from "../../../schema/postings.js";
import {
  transactions,
  transactionsTable,
} from "../../../schema/transactions.js";

/**
 * The database handle a store function runs on: the connection, or the
 * transaction the entry workflow opened, which exposes the same builders.
 */
export type LedgerDb = BetterSQLite3Database;

export type LedgerAuth = SapportaAuthContext;

/** A window of calendar days, each edge inclusive and optional. */
export type DayWindow = { from: string | null; to: string | null };

function inWindow(window: DayWindow): SQL | undefined {
  return and(
    window.from === null
      ? undefined
      : sql`${transactionsTable.date} >= ${window.from}`,
    window.to === null ? undefined : sql`${transactionsTable.date} <= ${window.to}`,
  );
}

export type AccountBalanceRow = {
  id: number;
  name: string;
  type: AccountType;
  /** Sum of signed postings in the window: debits positive, credits negative. */
  balance: number;
};

/**
 * Every visible account with the sum of its postings dated inside the window.
 * With an open window this is the account's balance; with a period it is the
 * account's activity in that period.
 */
export function accountBalances(
  db: LedgerDb,
  auth: LedgerAuth,
  window: DayWindow,
): AccountBalanceRow[] {
  const accountAccess = auth.rowSecurity.forTable(accounts);
  const postingAccess = auth.rowSecurity.forTable(postings);
  const transactionAccess = auth.rowSecurity.forTable(transactions);

  const sums = db
    .select({
      account_id: postingsTable.account_id,
      total: sql<number>`coalesce(sum(${postingsTable.amount}), 0)`.as("total"),
    })
    .from(postingsTable)
    .innerJoin(
      transactionsTable,
      and(
        eq(transactionsTable.id, postingsTable.transaction_id),
        transactionAccess.ownedRows(inWindow(window)),
      ),
    )
    .where(postingAccess.ownedRows())
    .groupBy(postingsTable.account_id)
    .as("sums");

  return db
    .select({
      id: accountsTable.id,
      name: accountsTable.name,
      type: accountsTable.type,
      balance: sql<number>`coalesce(${sums.total}, 0)`,
    })
    .from(accountsTable)
    .leftJoin(sums, eq(sums.account_id, accountsTable.id))
    .where(accountAccess.ownedRows())
    .orderBy(asc(accountsTable.name))
    .all();
}

export type AccountRow = { id: number; name: string; type: AccountType };

export function visibleAccount(
  db: LedgerDb,
  auth: LedgerAuth,
  accountId: number,
): AccountRow | undefined {
  const accountAccess = auth.rowSecurity.forTable(accounts);
  return db
    .select({
      id: accountsTable.id,
      name: accountsTable.name,
      type: accountsTable.type,
    })
    .from(accountsTable)
    .where(accountAccess.ownedRows(eq(accountsTable.id, accountId)))
    .get();
}

/** The type of each visible account among `ids`; an invisible id is absent. */
export function accountTypesById(
  db: LedgerDb,
  auth: LedgerAuth,
  ids: readonly number[],
): Map<number, AccountType> {
  if (ids.length === 0) return new Map();
  const accountAccess = auth.rowSecurity.forTable(accounts);
  const rows = db
    .select({ id: accountsTable.id, type: accountsTable.type })
    .from(accountsTable)
    .where(accountAccess.ownedRows(inArray(accountsTable.id, [...new Set(ids)])))
    .all();
  return new Map(rows.map((row) => [row.id, row.type]));
}

export type RegisterRow = {
  posting_id: number;
  transaction_id: number;
  date: string;
  payee: string | null;
  memo: string | null;
  amount: number;
};

/** One account's postings inside the window, oldest first. */
export function registerRows(
  db: LedgerDb,
  auth: LedgerAuth,
  accountId: number,
  window: DayWindow,
): RegisterRow[] {
  const postingAccess = auth.rowSecurity.forTable(postings);
  const transactionAccess = auth.rowSecurity.forTable(transactions);
  const payeeAccess = auth.rowSecurity.forTable(payees);

  return db
    .select({
      posting_id: postingsTable.id,
      transaction_id: transactionsTable.id,
      date: transactionsTable.date,
      payee: payeesTable.name,
      memo: transactionsTable.memo,
      amount: postingsTable.amount,
    })
    .from(postingsTable)
    .innerJoin(
      transactionsTable,
      and(
        eq(transactionsTable.id, postingsTable.transaction_id),
        transactionAccess.ownedRows(inWindow(window)),
      ),
    )
    .leftJoin(
      payeesTable,
      and(
        eq(payeesTable.id, transactionsTable.payee_id),
        payeeAccess.ownedRows(),
      ),
    )
    .where(postingAccess.ownedRows(eq(postingsTable.account_id, accountId)))
    .orderBy(
      asc(transactionsTable.date),
      asc(transactionsTable.id),
      asc(postingsTable.id),
    )
    .all()
    .map((row) => ({ ...row, date: row.date.toString() }));
}

/** The signed sum of one account's postings dated before `day`. */
export function balanceBefore(
  db: LedgerDb,
  auth: LedgerAuth,
  accountId: number,
  day: string,
): number {
  const postingAccess = auth.rowSecurity.forTable(postings);
  const transactionAccess = auth.rowSecurity.forTable(transactions);
  const row = db
    .select({
      total: sql<number>`coalesce(sum(${postingsTable.amount}), 0)`,
    })
    .from(postingsTable)
    .innerJoin(
      transactionsTable,
      and(
        eq(transactionsTable.id, postingsTable.transaction_id),
        transactionAccess.ownedRows(sql`${transactionsTable.date} < ${day}`),
      ),
    )
    .where(postingAccess.ownedRows(eq(postingsTable.account_id, accountId)))
    .get();
  return row?.total ?? 0;
}

export type AccountMonthRow = {
  /** Calendar month as `YYYY-MM`. */
  month: string;
  /** Transactions that touched the account in the month. */
  entries: number;
  debits: number;
  credits: number;
  /** Signed sum of the month's postings: debits less credits. */
  amount: number;
};

/**
 * One account's postings inside the window, totalled per calendar month.
 *
 * Months the account saw no posting in are absent: the report fills the gaps,
 * because only it knows which months the window covers.
 */
export function accountMonthTotals(
  db: LedgerDb,
  auth: LedgerAuth,
  accountId: number,
  window: DayWindow,
): AccountMonthRow[] {
  const postingAccess = auth.rowSecurity.forTable(postings);
  const transactionAccess = auth.rowSecurity.forTable(transactions);
  const month = sql<string>`substr(${transactionsTable.date}, 1, 7)`;

  return db
    .select({
      month,
      entries: sql<number>`count(distinct ${transactionsTable.id})`,
      debits: sql<number>`coalesce(sum(max(${postingsTable.amount}, 0)), 0)`,
      credits: sql<number>`coalesce(-sum(min(${postingsTable.amount}, 0)), 0)`,
      amount: sql<number>`coalesce(sum(${postingsTable.amount}), 0)`,
    })
    .from(postingsTable)
    .innerJoin(
      transactionsTable,
      and(
        eq(transactionsTable.id, postingsTable.transaction_id),
        transactionAccess.ownedRows(inWindow(window)),
      ),
    )
    .where(postingAccess.ownedRows(eq(postingsTable.account_id, accountId)))
    .groupBy(month)
    .orderBy(month)
    .all();
}

export type JournalTransactionRow = {
  id: number;
  date: string;
  payee: string | null;
  memo: string | null;
};

export type JournalPostingRow = {
  id: number;
  transaction_id: number;
  account_id: number;
  account: string;
  amount: number;
};

/** Transactions dated inside the window, newest first, with their postings. */
export function journalRows(
  db: LedgerDb,
  auth: LedgerAuth,
  window: DayWindow,
): { transactions: JournalTransactionRow[]; postings: JournalPostingRow[] } {
  const transactionAccess = auth.rowSecurity.forTable(transactions);
  const payeeAccess = auth.rowSecurity.forTable(payees);
  const postingAccess = auth.rowSecurity.forTable(postings);
  const accountAccess = auth.rowSecurity.forTable(accounts);

  const headers = db
    .select({
      id: transactionsTable.id,
      date: transactionsTable.date,
      payee: payeesTable.name,
      memo: transactionsTable.memo,
    })
    .from(transactionsTable)
    .leftJoin(
      payeesTable,
      and(
        eq(payeesTable.id, transactionsTable.payee_id),
        payeeAccess.ownedRows(),
      ),
    )
    .where(transactionAccess.ownedRows(inWindow(window)))
    .orderBy(desc(transactionsTable.date), desc(transactionsTable.id))
    .all()
    .map((row) => ({ ...row, date: row.date.toString() }));

  const lines = db
    .select({
      id: postingsTable.id,
      transaction_id: postingsTable.transaction_id,
      account_id: postingsTable.account_id,
      account: accountsTable.name,
      amount: postingsTable.amount,
    })
    .from(postingsTable)
    .innerJoin(
      transactionsTable,
      and(
        eq(transactionsTable.id, postingsTable.transaction_id),
        transactionAccess.ownedRows(inWindow(window)),
      ),
    )
    .innerJoin(
      accountsTable,
      and(eq(accountsTable.id, postingsTable.account_id), accountAccess.ownedRows()),
    )
    .where(postingAccess.ownedRows())
    .orderBy(asc(postingsTable.id))
    .all();

  return { transactions: headers, postings: lines };
}

/** Budgeted amount by account for one `YYYY-MM` month. */
export function budgetsForMonth(
  db: LedgerDb,
  auth: LedgerAuth,
  month: string,
): Map<number, number> {
  const budgetAccess = auth.rowSecurity.forTable(budgets);
  const rows = db
    .select({ account_id: budgetsTable.account_id, amount: budgetsTable.amount })
    .from(budgetsTable)
    .where(budgetAccess.ownedRows(eq(budgetsTable.month, month)))
    .all();
  return new Map(rows.map((row) => [row.account_id, row.amount]));
}

export type StoredTransaction = {
  id: number;
  date: string;
  payee_id: number | null;
  payee_name: string | null;
  memo: string | null;
};

export function visibleTransaction(
  db: LedgerDb,
  auth: LedgerAuth,
  transactionId: number,
): StoredTransaction | undefined {
  const transactionAccess = auth.rowSecurity.forTable(transactions);
  const payeeAccess = auth.rowSecurity.forTable(payees);
  const row = db
    .select({
      id: transactionsTable.id,
      date: transactionsTable.date,
      payee_id: transactionsTable.payee_id,
      payee_name: payeesTable.name,
      memo: transactionsTable.memo,
    })
    .from(transactionsTable)
    .leftJoin(
      payeesTable,
      and(
        eq(payeesTable.id, transactionsTable.payee_id),
        payeeAccess.ownedRows(),
      ),
    )
    .where(transactionAccess.ownedRows(eq(transactionsTable.id, transactionId)))
    .get();
  return row === undefined ? undefined : { ...row, date: row.date.toString() };
}

export function postingsOfTransaction(
  db: LedgerDb,
  auth: LedgerAuth,
  transactionId: number,
): { id: number; account_id: number; amount: number }[] {
  const postingAccess = auth.rowSecurity.forTable(postings);
  return db
    .select({
      id: postingsTable.id,
      account_id: postingsTable.account_id,
      amount: postingsTable.amount,
    })
    .from(postingsTable)
    .where(
      postingAccess.ownedRows(eq(postingsTable.transaction_id, transactionId)),
    )
    .orderBy(asc(postingsTable.id))
    .all();
}

export type StoredPayee = { id: number; default_account_id: number | null };

export function visiblePayee(
  db: LedgerDb,
  auth: LedgerAuth,
  payeeId: number,
): StoredPayee | undefined {
  const payeeAccess = auth.rowSecurity.forTable(payees);
  return db
    .select({
      id: payeesTable.id,
      default_account_id: payeesTable.default_account_id,
    })
    .from(payeesTable)
    .where(payeeAccess.ownedRows(eq(payeesTable.id, payeeId)))
    .get();
}

export function payeeByName(
  db: LedgerDb,
  auth: LedgerAuth,
  name: string,
): StoredPayee | undefined {
  const payeeAccess = auth.rowSecurity.forTable(payees);
  return db
    .select({
      id: payeesTable.id,
      default_account_id: payeesTable.default_account_id,
    })
    .from(payeesTable)
    .where(
      payeeAccess.ownedRows(sql`lower(${payeesTable.name}) = lower(${name})`),
    )
    .get();
}

export function setPayeeDefaultAccount(
  db: LedgerDb,
  auth: LedgerAuth,
  payeeId: number,
  accountId: number,
): void {
  const payeeAccess = auth.rowSecurity.forTable(payees);
  db.update(payeesTable)
    .set({ default_account_id: accountId })
    .where(payeeAccess.ownedRows(eq(payeesTable.id, payeeId)))
    .run();
}
