/**
 * One sub-app carrying every ledger report. `app.ts` mounts it and merges its
 * contracts into the OpenAPI document.
 */
import { TsRestApi, type SapportaEnv } from "@sapporta/server";
import { registerBalances } from "./balances.js";
import { registerCashFlow } from "./cash-flow.js";
import { registerJournal } from "./journal.js";
import { registerRegister } from "./register.js";
import { registerSpending } from "./spending.js";
import type { ReportClock } from "./shared.js";

export function createReportsApi(clock: ReportClock): TsRestApi<SapportaEnv> {
  const api = new TsRestApi<SapportaEnv>();
  registerBalances(api, clock);
  registerCashFlow(api, clock);
  registerSpending(api, clock);
  registerRegister(api, clock);
  registerJournal(api, clock);
  return api;
}
