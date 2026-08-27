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
import type {
  DemoResetDeps,
  DemoResetSettings,
} from "./app/demo-reset.js";
import { createDemoResetApi } from "./app/demo-reset.js";
import { createReportsApi } from "./app/reports/index.js";
import transactionsApi from "./app/transactions.js";
import type { SapportaMailer } from "./mailer.js";
import type { PublicRoutePattern } from "./project-auth/index.js";

export interface LoadAppOptions {
  conn: ProjectDbConnection;
  mailer: SapportaMailer;
  /** Null on every deployment that has not named a demo snapshot. */
  demoReset: DemoResetSettings | null;
  demoResetDeps: DemoResetDeps;
}

/** `route()` serves the handlers; `extend()` publishes them to OpenAPI. */
function mountApi(app: TsRestApi<SapportaEnv>, api: TsRestApi<SapportaEnv>) {
  app.route("/", api);
  app.extend(api);
}

// Files in `app/` are not exposed until they are mounted here.
export function loadApp(app: TsRestApi<SapportaEnv>, options: LoadAppOptions) {
  mountApi(app, transactionsApi);
  mountApi(app, createReportsApi({ now: () => Temporal.Now.instant() }));

  // Only a deployment that has published a snapshot to restore from can offer
  // to restore it. Everywhere else the route does not exist at all, which is a
  // stronger thing to be able to say about it than that nobody is allowed to
  // call it.
  if (options.demoReset) {
    mountApi(app, createDemoResetApi(options.demoReset, options.demoResetDeps));
  }
}

// These custom routes may be called without signing in. The books are private,
// so nothing is listed. The demo reset is not listed either: on a demo every
// uncredentialed request already arrives as the demo account, and on any other
// deployment restoring the books is not something a stranger should be able to
// ask for.
export const publicApiRoutes = [] as const satisfies readonly PublicRoutePattern[];
