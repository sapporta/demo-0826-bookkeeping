/**
 * Account register: one account's postings in date order with a running
 * balance — the page a person opens to see what happened in an account, and
 * the drill-down every other report lands on.
 */
import type { TsRestApi, SapportaEnv } from "@sapporta/server";
import { workspaceTimeZone } from "@sapporta/server";
import type { GridDataset, GridDatasetNode } from "@sapporta/shared/grid-dataset";
import { normalBalanceSign, reportsContract, roundMoney } from "bookkeeping-shared";
import {
  balanceBefore,
  registerRows,
  visibleAccount,
  type AccountRow,
  type RegisterRow,
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

export function registerRegister(api: TsRestApi<SapportaEnv>, clock: ReportClock) {
  api.register("register", reportsContract.register, ({ c, request }) => {
    const auth = requireAuthorizedWorkspaceData(c, READ_REPORTS);
    const read = readPeriod(request.query, workspaceTimeZone(auth), clock.now());
    if (!read.ok) return read.response;
    const db = c.get("db");
    const account = visibleAccount(db, auth, request.query.account_id);
    if (account === undefined) {
      return {
        status: 404,
        body: { error: "Account not found", code: "ACCOUNT_NOT_FOUND" },
      };
    }
    const { window } = read;
    return {
      status: 200,
      body: registerDataset({
        account,
        opening:
          window.from === null ? 0 : balanceBefore(db, auth, account.id, window.from),
        rows: registerRows(db, auth, account.id, window),
        from: window.from,
        to: window.to,
      }),
    };
  });
}

export type RegisterInput = {
  account: AccountRow;
  /** Signed sum of postings before `from`; zero when the window is open. */
  opening: number;
  rows: readonly RegisterRow[];
  from: string | null;
  to: string | null;
};

export function registerDataset({ account, opening, rows, from, to }: RegisterInput): GridDataset {
  const sign = normalBalanceSign(account.type);
  let running = opening;
  let debits = 0;
  let credits = 0;

  const nodes: GridDatasetNode[] = [];
  if (from !== null) {
    nodes.push({
      rowKey: "opening",
      levelName: "posting",
      kind: "opening",
      columns: {
        transaction_id: null,
        date: from,
        payee: null,
        memo: "Opening balance",
        debit: null,
        credit: null,
        balance: roundMoney(sign * opening),
      },
    });
  }
  for (const row of rows) {
    running = roundMoney(running + row.amount);
    if (row.amount > 0) debits = roundMoney(debits + row.amount);
    else credits = roundMoney(credits - row.amount);
    nodes.push({
      rowKey: `posting:${row.posting_id}`,
      levelName: "posting",
      columns: {
        transaction_id: row.transaction_id,
        date: row.date,
        payee: row.payee,
        memo: row.memo,
        debit: row.amount > 0 ? row.amount : null,
        credit: row.amount < 0 ? -row.amount : null,
        balance: roundMoney(sign * running),
      },
    });
  }
  nodes.push({
    rowKey: "closing",
    levelName: "posting",
    kind: "closing",
    columns: {
      transaction_id: null,
      date: to,
      payee: null,
      memo: "Closing balance",
      debit: null,
      credit: null,
      balance: roundMoney(sign * running),
    },
  });

  return {
    name: "register",
    label: `${account.name} — register, ${windowLabel({ from, to })}`,
    rootLevel: "posting",
    levels: {
      posting: {
        label: "Postings",
        childLevels: [],
        rowLinks: [editEntryLink],
        columns: [
          hiddenColumn("transaction_id", "number"),
          { id: "date", label: "Date", kind: "date", links: [editEntryLink] },
          { id: "payee", label: "Payee", kind: "text", minWidth: 24 },
          { id: "memo", label: "Memo", kind: "text", minWidth: 36 },
          moneyColumn("debit", "Debit", { zeroDisplay: "blank" }),
          moneyColumn("credit", "Credit", { zeroDisplay: "blank" }),
          moneyColumn("balance", "Balance", { colorRule: "signed", strong: true }),
        ],
      },
    },
    nodes,
    footerRows: [
      {
        rowKey: "totals",
        columns: { memo: "Period totals", debit: debits, credit: credits },
      },
    ],
  };
}
