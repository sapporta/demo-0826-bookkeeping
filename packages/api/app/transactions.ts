/**
 * The entry endpoints. Each adapter resolves the caller's workspace authority,
 * hands the domain workflow `{ db, auth }`, and maps the workflow's expected
 * failures to the responses the contract declares.
 */
import { TsRestApi, type SapportaEnv } from "@sapporta/server";
import type { ErrorBody } from "@sapporta/shared/contracts";
import { ledgerContract } from "bookkeeping-shared";
import {
  InvalidEntryError,
  LedgerError,
  TransactionNotFoundError,
} from "../modules/ledger/entry.js";
import {
  createEntry,
  deleteTransaction,
  readTransaction,
  replaceEntry,
} from "../modules/ledger/save-entry.js";
import { requireAuthorizedWorkspaceData } from "../project-auth/index.js";

const RECORD_ENTRIES = { action: "run", subject: "ledger_entry" } as const;
const READ_ENTRIES = { action: "read", subject: "transactions" } as const;

/** Maps the expected ledger failures to their declared responses. */
function ledgerErrorResponse(
  error: unknown,
): { status: 404; body: ErrorBody } | { status: 422; body: ErrorBody } {
  if (!(error instanceof LedgerError)) throw error;
  switch (error.status) {
    case 404:
      return { status: 404, body: error.payload };
    case 422:
      return { status: 422, body: error.payload };
  }
}

function invalidEntryResponse(error: unknown): { status: 422; body: ErrorBody } {
  if (!(error instanceof InvalidEntryError)) throw error;
  return { status: 422, body: error.payload };
}

function notFoundResponse(error: unknown): { status: 404; body: ErrorBody } {
  if (!(error instanceof TransactionNotFoundError)) throw error;
  return { status: 404, body: error.payload };
}

const api = new TsRestApi<SapportaEnv>();

api.register("createEntry", ledgerContract.createEntry, ({ c, request }) => {
  const auth = requireAuthorizedWorkspaceData(c, RECORD_ENTRIES);
  try {
    return {
      status: 201,
      body: createEntry({ db: c.get("db"), auth }, request.body),
    };
  } catch (error) {
    return invalidEntryResponse(error);
  }
});

api.register("getTransaction", ledgerContract.getTransaction, ({ c, request }) => {
  const auth = requireAuthorizedWorkspaceData(c, READ_ENTRIES);
  try {
    return {
      status: 200,
      body: readTransaction({ db: c.get("db"), auth }, request.params.id),
    };
  } catch (error) {
    return notFoundResponse(error);
  }
});

api.register("replaceEntry", ledgerContract.replaceEntry, ({ c, request }) => {
  const auth = requireAuthorizedWorkspaceData(c, RECORD_ENTRIES);
  try {
    return {
      status: 200,
      body: replaceEntry(
        { db: c.get("db"), auth },
        request.params.id,
        request.body,
      ),
    };
  } catch (error) {
    return ledgerErrorResponse(error);
  }
});

api.register(
  "deleteTransaction",
  ledgerContract.deleteTransaction,
  ({ c, request }) => {
    const auth = requireAuthorizedWorkspaceData(c, RECORD_ENTRIES);
    try {
      return {
        status: 200,
        body: deleteTransaction({ db: c.get("db"), auth }, request.params.id),
      };
    } catch (error) {
      return notFoundResponse(error);
    }
  },
);

export default api;
