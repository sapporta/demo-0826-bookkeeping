/**
 * Journal: every transaction in a period with its postings underneath — the
 * list a person browses to find an entry and open it for editing.
 */
import type { TsRestApi, SapportaEnv } from "@sapporta/server";
import { workspaceTimeZone } from "@sapporta/server";
import type { GridDataset } from "@sapporta/shared/grid-dataset";
import { reportsContract, roundMoney } from "bookkeeping-shared";
import {
  journalRows,
  type JournalPostingRow,
  type JournalTransactionRow,
} from "../../modules/ledger/db/ledger-store.js";
import { requireAuthorizedWorkspaceData } from "../../project-auth/index.js";
import {
  editEntryLink,
  hiddenColumn,
  moneyColumn,
  READ_REPORTS,
  readPeriod,
  windowLabel,
  type ReportClock,
} from "./shared.js";

export function registerJournal(api: TsRestApi<SapportaEnv>, clock: ReportClock) {
  api.register("journal", reportsContract.journal, ({ c, request }) => {
    const auth = requireAuthorizedWorkspaceData(c, READ_REPORTS);
    const read = readPeriod(request.query, workspaceTimeZone(auth), clock.now());
    if (!read.ok) return read.response;
    const { window } = read;
    return {
      status: 200,
      body: journalDataset({
        ...journalRows(c.get("db"), auth, window),
        from: window.from,
        to: window.to,
      }),
    };
  });
}

export type JournalInput = {
  transactions: readonly JournalTransactionRow[];
  postings: readonly JournalPostingRow[];
  from: string | null;
  to: string | null;
};

export function journalDataset({ transactions, postings, from, to }: JournalInput): GridDataset {
  const postingsByTransaction = new Map<number, JournalPostingRow[]>();
  for (const posting of postings) {
    const list = postingsByTransaction.get(posting.transaction_id) ?? [];
    list.push(posting);
    postingsByTransaction.set(posting.transaction_id, list);
  }

  return {
    name: "journal",
    label: `Transactions, ${windowLabel({ from, to })}`,
    rootLevel: "transaction",
    levels: {
      transaction: {
        label: "Transactions",
        childLevels: ["posting"],
        defaultCollapsed: true,
        rowLinks: [editEntryLink],
        columns: [
          hiddenColumn("transaction_id", "number"),
          { id: "date", label: "Date", kind: "date", links: [editEntryLink] },
          { id: "payee", label: "Payee", kind: "text", minWidth: 24 },
          { id: "memo", label: "Memo", kind: "text", minWidth: 36 },
          moneyColumn("amount", "Amount", { strong: true }),
        ],
      },
      posting: {
        label: "Postings",
        childLevels: [],
        columns: [
          hiddenColumn("account_id", "number"),
          // The screen links this cell to the register for the period it is
          // showing; a declarative link here would be ignored in its favour.
          { id: "account", label: "Account", kind: "text", minWidth: 36 },
          moneyColumn("debit", "Debit", { zeroDisplay: "blank" }),
          moneyColumn("credit", "Credit", { zeroDisplay: "blank" }),
        ],
      },
    },
    nodes: transactions.map((transaction) => {
      const lines = postingsByTransaction.get(transaction.id) ?? [];
      const amount = roundMoney(
        lines.filter((l) => l.amount > 0).reduce((sum, l) => sum + l.amount, 0),
      );
      return {
        rowKey: `transaction:${transaction.id}`,
        levelName: "transaction",
        columns: {
          transaction_id: transaction.id,
          date: transaction.date,
          payee: transaction.payee,
          memo: transaction.memo,
          amount,
        },
        children: {
          posting: lines.map((line) => ({
            rowKey: `posting:${line.id}`,
            levelName: "posting",
            columns: {
              account_id: line.account_id,
              account: line.account,
              debit: line.amount > 0 ? line.amount : null,
              credit: line.amount < 0 ? -line.amount : null,
            },
          })),
        },
      };
    }),
  };
}
