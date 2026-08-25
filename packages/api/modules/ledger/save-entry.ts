/**
 * Recording an entry is one transition: resolve the payee, prove the postings
 * balance and name the right kinds of account, then write the header and its
 * postings together. A route hands this `{ db, auth }` from the request; the
 * seed script hands it the same pair from the script runtime.
 */
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { Temporal } from "@sapporta/shared/temporal";
import type {
  EntryBody,
  EntryResult,
  PayeeRef,
  TransactionDetail,
} from "bookkeeping-shared";
import { payees, payeesTable } from "../../schema/payees.js";
import { postings, postingsTable } from "../../schema/postings.js";
import { transactions, transactionsTable } from "../../schema/transactions.js";
import {
  accountTypesById,
  payeeByName,
  postingsOfTransaction,
  setPayeeDefaultAccount,
  visiblePayee,
  visibleTransaction,
  type LedgerAuth,
  type LedgerDb,
} from "./db/ledger-store.js";
import {
  accountIdsInEntry,
  accountRoleIssues,
  categoryAccountOfEntry,
  InvalidEntryError,
  postingsForEntry,
  TransactionNotFoundError,
  type PostingDraft,
} from "./entry.js";

export type LedgerContext = {
  db: BetterSQLite3Database;
  auth: LedgerAuth;
};

export function createEntry(
  { db, auth }: LedgerContext,
  entry: EntryBody,
): EntryResult {
  const transactionAccess = auth.rowSecurity.forTable(transactions);

  return db.transaction((tx) => {
    const drafts = validatedPostings(tx, auth, entry);
    const payeeId = resolvePayee(tx, auth, entry);

    const headerValues = transactionAccess.insertValuesSync(
      tx,
      headerValuesFor(entry, payeeId),
    );
    const header = tx
      .insert(transactionsTable)
      .values(headerValues as typeof transactionsTable.$inferInsert)
      .returning({ id: transactionsTable.id })
      .get();

    insertPostings(tx, auth, header.id, drafts);
    return { transaction_id: header.id, payee_id: payeeId };
  });
}

export function replaceEntry(
  { db, auth }: LedgerContext,
  transactionId: number,
  entry: EntryBody,
): EntryResult {
  const transactionAccess = auth.rowSecurity.forTable(transactions);
  const postingAccess = auth.rowSecurity.forTable(postings);

  return db.transaction((tx) => {
    if (visibleTransaction(tx, auth, transactionId) === undefined) {
      throw new TransactionNotFoundError();
    }
    const drafts = validatedPostings(tx, auth, entry);
    const payeeId = resolvePayee(tx, auth, entry);

    tx.update(transactionsTable)
      .set(headerValuesFor(entry, payeeId))
      .where(transactionAccess.ownedRows(eq(transactionsTable.id, transactionId)))
      .run();
    tx.delete(postingsTable)
      .where(
        postingAccess.ownedRows(eq(postingsTable.transaction_id, transactionId)),
      )
      .run();
    insertPostings(tx, auth, transactionId, drafts);

    return { transaction_id: transactionId, payee_id: payeeId };
  });
}

export function deleteTransaction(
  { db, auth }: LedgerContext,
  transactionId: number,
): { transaction_id: number } {
  const transactionAccess = auth.rowSecurity.forTable(transactions);

  return db.transaction((tx) => {
    if (visibleTransaction(tx, auth, transactionId) === undefined) {
      throw new TransactionNotFoundError();
    }
    // Postings go with the header: the foreign key cascades.
    tx.delete(transactionsTable)
      .where(transactionAccess.ownedRows(eq(transactionsTable.id, transactionId)))
      .run();
    return { transaction_id: transactionId };
  });
}

export function readTransaction(
  { db, auth }: LedgerContext,
  transactionId: number,
): TransactionDetail {
  const header = visibleTransaction(db, auth, transactionId);
  if (header === undefined) throw new TransactionNotFoundError();
  return { ...header, postings: postingsOfTransaction(db, auth, transactionId) };
}

function headerValuesFor(entry: EntryBody, payeeId: number | null) {
  return {
    date: Temporal.PlainDate.from(entry.date),
    payee_id: payeeId,
    memo: entry.memo.trim() === "" ? null : entry.memo.trim(),
  };
}

function validatedPostings(
  db: LedgerDb,
  auth: LedgerAuth,
  entry: EntryBody,
): PostingDraft[] {
  const typeById = accountTypesById(db, auth, accountIdsInEntry(entry));
  const issues = accountRoleIssues(entry, typeById);
  if (issues.length > 0) throw new InvalidEntryError(issues);
  return postingsForEntry(entry);
}

function insertPostings(
  db: LedgerDb,
  auth: LedgerAuth,
  transactionId: number,
  drafts: readonly PostingDraft[],
): void {
  const postingAccess = auth.rowSecurity.forTable(postings);
  for (const draft of drafts) {
    const values = postingAccess.insertValuesSync(db, draft, {
      serverValues: { transaction_id: transactionId },
    });
    db.insert(postingsTable)
      .values(values as typeof postingsTable.$inferInsert)
      .run();
  }
}

/**
 * The payee this entry belongs to: an existing one, one created from a name
 * on the way through, or none. A payee that has no default account yet learns
 * the category this entry was filed under, so the next entry for it starts
 * out categorized.
 */
function resolvePayee(
  db: LedgerDb,
  auth: LedgerAuth,
  entry: EntryBody,
): number | null {
  const ref: PayeeRef = entry.payee;
  if (ref === null) return null;
  const category = categoryAccountOfEntry(entry);

  if ("id" in ref) {
    const existing = visiblePayee(db, auth, ref.id);
    if (existing === undefined) {
      throw new InvalidEntryError([{ field: "payee", message: "Payee not found." }]);
    }
    return rememberCategory(db, auth, existing, category);
  }

  const existing = payeeByName(db, auth, ref.name);
  if (existing !== undefined) {
    return rememberCategory(db, auth, existing, category);
  }

  const payeeAccess = auth.rowSecurity.forTable(payees);
  const values = payeeAccess.insertValuesSync(db, {
    name: ref.name,
    default_account_id: category,
  });
  return db
    .insert(payeesTable)
    .values(values as typeof payeesTable.$inferInsert)
    .returning({ id: payeesTable.id })
    .get().id;
}

function rememberCategory(
  db: LedgerDb,
  auth: LedgerAuth,
  payee: { id: number; default_account_id: number | null },
  category: number | null,
): number {
  if (payee.default_account_id === null && category !== null) {
    setPayeeDefaultAccount(db, auth, payee.id, category);
  }
  return payee.id;
}
