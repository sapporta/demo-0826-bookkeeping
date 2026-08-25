/**
 * App-specific API routes.
 *
 * Sapporta creates standard APIs for tables in `schema/`. Custom APIs — the
 * entry workflow and the reports — are mounted in `loadApp()` below. The app
 * is already scoped to `/api`, so a contract path of `/transactions` serves
 * `/api/transactions`.
 */
import type {
  ProjectDbConnection,
  SapportaEnv,
  TsRestApi,
} from "@sapporta/server";
import { Temporal } from "@sapporta/shared/temporal";
import { createReportsApi } from "./app/reports/index.js";
import transactionsApi from "./app/transactions.js";
import type { SapportaMailer } from "./mailer.js";
import type { PublicRoutePattern } from "./project-auth/index.js";

export interface LoadAppOptions {
  conn: ProjectDbConnection;
  mailer: SapportaMailer;
}

/** `route()` serves the handlers; `extend()` publishes them to OpenAPI. */
function mountApi(app: TsRestApi<SapportaEnv>, api: TsRestApi<SapportaEnv>) {
  app.route("/", api);
  app.extend(api);
}

// Files in `app/` are not exposed until they are mounted here.
export function loadApp(app: TsRestApi<SapportaEnv>, _options: LoadAppOptions) {
  mountApi(app, transactionsApi);
  mountApi(app, createReportsApi({ now: () => Temporal.Now.instant() }));
}

// These custom routes may be called without signing in. The books are private,
// so nothing is listed.
export const publicApiRoutes = [] as const satisfies readonly PublicRoutePattern[];
