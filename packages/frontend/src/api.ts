// Typed browser clients for the application's custom APIs.
//
// Each client uses the same contract as its server handler. `getApiBase` picks
// the local or deployed API URL. Methods return the 2xx body and throw
// `ApiError` for other responses.

import { createApiClient } from "@sapporta/shared/client";
import { getApiBase } from "@sapporta/frontend/platform";
import { ledgerContract, reportsContract } from "bookkeeping-shared";

/** Record, read, replace, and delete entries. */
export const ledgerApi = createApiClient(ledgerContract, {
  baseUrl: getApiBase,
});

/** Profit & Loss, balances, spending, the drill-downs, and the journal. */
export const reportsApi = createApiClient(reportsContract, {
  baseUrl: getApiBase,
});
