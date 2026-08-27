import { AbilityBuilder, createMongoAbility } from "@casl/ability";
import type { AppAbility, AppAuthFacts } from "./types.js";

/** The application tables every member of a workspace works with. */
const LEDGER_TABLES = [
  "accounts",
  "payees",
  "transactions",
  "postings",
  "budgets",
] as const;

/**
 * Defines what this requester may do.
 *
 * No rule means no access. Generated table routes ask for actions such as
 * `read`, `create`, and `export` on the table name. The entry workflow asks
 * for `run` on `ledger_entry`, and every report asks for `read` on `reports`.
 * Row access is defined separately in `request-data-authority.ts`.
 */
export function buildAbility(ctx: AppAuthFacts): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  if (ctx.principal.kind === "user") {
    can("read", "agent_access_token");
    can("create", "agent_access_token");
    can("delete", "agent_access_token");

    // Every member keeps the same books: they read everything, record entries,
    // and maintain the chart of accounts, payees, and budgets.
    can(["read", "export"], [...LEDGER_TABLES]);
    can(["create", "update", "delete"], ["accounts", "payees", "budgets"]);
    can("run", "ledger_entry");
    can("read", "reports");

    // Restoring the demo snapshot puts the books back to what this deployment
    // shipped and can do nothing else, so it is not held back from the account
    // whose books they are - on a demo, that is everyone. The route only
    // exists where a snapshot is configured; see `app/demo-reset.ts`.
    can("run", "demo_reset");
  }

  if (
    ctx.principal.kind === "user" &&
    ctx.principal.membership.roles.includes("owner")
  ) {
    // `manage all` below would also include this unrestricted access subject.
    // Keep the explicit grant so the owner role's raw system access is visible.
    can("manage", "sapporta_unrestricted_access");

    // This allows owner actions; row security still limits database rows to the
    // request's trusted ownership facts.
    can("manage", "all");
  }

  return build();
}
