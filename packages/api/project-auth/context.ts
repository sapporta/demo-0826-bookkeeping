import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  anonymousPrincipal,
  createAuthContext,
  userPrincipal,
  type BuildAbility,
  type RequestDataAuthority,
  type ProjectDbConnection,
  type SapportaAuthContext,
  type SapportaAuthUser,
  type SapportaEnv,
  type TableCatalog,
} from "@sapporta/server";
import type {
  AppAbility,
  AppPrincipal,
  AppWorkspaceMembership,
} from "../authz/types.js";
import type { BetterAuthSessionApi } from "./better-auth.js";
import {
  ensureActiveWorkspace,
  ensureWorkspaceMembership,
  membershipFromRow,
  switchWorkspaceMembership,
} from "./workspace.js";
import { findUserByEmail } from "./user.js";
import { authFailure } from "./errors.js";
import { resolveBearerTokenPrincipal, TokenAuthError } from "./auth-tokens.js";

/**
 * Decides which rows a request may touch.
 *
 * The request is required, not optional, and there is deliberately no second
 * resolver that does without it. An application that narrows or widens row
 * access per route needs the request, and a resolver that had to cope with its
 * absence would be a resolver where forgetting the absent case quietly changes
 * what a caller may read and write.
 */
export type ResolveRequestDataAuthority = (input: {
  principal: AppPrincipal;
  c: Context<SapportaEnv>;
}) => Promise<RequestDataAuthority>;

/**
 * Minimal Better Auth session shape needed to build the request principal.
 *
 * The session identifies the signed-in user. It does not decide row access by
 * itself; the app's data-authority resolver does that after the principal is
 * known.
 */
export interface BetterAuthSessionPayload {
  session: {
    id: string;
    userId: string;
    activeOrganizationId?: string | null;
  };
  user: {
    id: string;
    name?: string | null;
    email: string;
    emailVerified: boolean;
  };
}

export interface ResolveSapportaAuthContextInput {
  auth: BetterAuthSessionApi;
  conn: ProjectDbConnection;
  catalog: TableCatalog;
  headers: Headers;
  c: Context<SapportaEnv>;
  buildAbility: BuildAbility<AppAbility, AppWorkspaceMembership>;
  resolveRequestDataAuthority: ResolveRequestDataAuthority;
  /**
   * The account to serve a request that carries no credential as, from
   * `SAPPORTA_DEMO_USER_EMAIL`, or null to require sign-in. Read once at
   * startup by `readProjectAuthEnv()`, which documents what naming an address
   * here gives up.
   */
  demoUserEmail: string | null;
}

/**
 * Builds the auth context every API handler reads from `c.get("auth")`.
 *
 * A request can identify the user in two ways:
 * - an agent access token in `Authorization: Bearer ...`
 * - a browser session cookie from the app UI
 *
 * Bearer tokens are checked first because they explicitly name the workspace
 * for this request. If neither credential is present, the request is anonymous;
 * public routes can still run, while private routes reject it before reading
 * application data. A deployment that has named a demo account is the one
 * exception: there, a request with no credential is served as that account
 * instead of anonymously.
 */
export async function resolveSapportaAuthContext(
  input: ResolveSapportaAuthContextInput,
): Promise<SapportaAuthContext<AppAbility, AppWorkspaceMembership>> {
  const principal = await resolvePrincipal(
    input.auth,
    input.conn,
    input.headers,
    input.demoUserEmail,
  );
  return authContextFrom({
    principal,
    dataAuthority: await input.resolveRequestDataAuthority({
      principal,
      c: input.c,
    }),
    buildAbility: input.buildAbility,
    catalog: input.catalog,
  });
}

/**
 * Assembles the auth context from facts that are already settled.
 *
 * Who the caller is and which rows they may touch are both decided before this
 * point, by whichever route the caller arrived on. This only puts those two
 * answers together, which is why it stays inside this file: every way of
 * getting here goes through one of the exported functions above.
 */
function authContextFrom(input: {
  principal: AppPrincipal;
  dataAuthority: RequestDataAuthority;
  buildAbility: BuildAbility<AppAbility, AppWorkspaceMembership>;
  catalog: TableCatalog;
}): SapportaAuthContext<AppAbility, AppWorkspaceMembership> {
  const { principal, dataAuthority } = input;
  return createAuthContext({
    principal,
    dataAuthority,
    ability: input.buildAbility({ principal, dataAuthority }),
    catalog: input.catalog,
  });
}

/**
 * Moves this session to another workspace it belongs to.
 *
 * This asks for everything the resolver above does except the demo account,
 * because switching is a change to a stored session and a demo request has no
 * session to change. A deployment that serves requests as a demo account
 * therefore has one workspace, the demo account's, and this route answers that
 * the caller must sign in first.
 */
export async function switchActiveWorkspace(
  input: Omit<ResolveSapportaAuthContextInput, "demoUserEmail"> & {
    workspaceId: string;
  },
): Promise<SapportaAuthContext<AppAbility, AppWorkspaceMembership>> {
  const payload = await getSessionPayload(input.auth, input.headers);
  if (!payload) {
    throw new Error("You must sign in before switching workspaces.");
  }
  const membership = switchWorkspaceMembership(
    input.conn,
    payload,
    input.workspaceId,
  );
  const principal = userPrincipal({
    user: userFromSessionPayload(payload),
    membership: membershipFromRow(membership),
  });
  return authContextFrom({
    principal,
    dataAuthority: await input.resolveRequestDataAuthority({
      principal,
      c: input.c,
    }),
    buildAbility: input.buildAbility,
    catalog: input.catalog,
  });
}

/**
 * Names the caller of one request.
 *
 * `demoUserEmail` is a required argument rather than a defaulted one: it
 * decides whether an unidentified caller is a stranger or the demo account,
 * and a default would let a call site settle that question by saying nothing.
 */
export async function resolvePrincipal(
  auth: BetterAuthSessionApi,
  conn: ProjectDbConnection,
  headers: Headers,
  demoUserEmail: string | null,
): Promise<AppPrincipal> {
  try {
    const bearerPrincipal = resolveBearerTokenPrincipal(conn, headers);
    if (bearerPrincipal) return bearerPrincipal;
  } catch (err) {
    if (err instanceof TokenAuthError) {
      const failure = authFailure(err.code);
      throw new HTTPException(failure.status, {
        res: Response.json(failure.body, { status: failure.status }),
      });
    }
    throw err;
  }

  const payload = await getSessionPayload(auth, headers);
  if (!payload) {
    return demoUserEmail
      ? demoUserPrincipal(conn, demoUserEmail)
      : anonymousPrincipal();
  }
  const membership = ensureActiveWorkspace(conn, payload);
  return userPrincipal({
    user: userFromSessionPayload(payload),
    membership: membershipFromRow(membership),
  });
}

/**
 * The demo account, as a principal, with no credential to prove.
 *
 * The account is named by the deployment and not by the request, so a caller
 * cannot ask to be served as somebody else by naming them. Once it is built,
 * this principal is an ordinary one: the ability builder and
 * `resolveRequestDataAuthority()` decide what it may do and which rows it may
 * touch, exactly as they do for a person who signed in as this account.
 *
 * The workspace is the one the account works in, created on first use if the
 * account has joined none - the same reading `pnpm seed` and any other script
 * gets from `openScriptRuntime()`, so a demo request and a seed run write to
 * one workspace rather than two.
 */
function demoUserPrincipal(
  conn: ProjectDbConnection,
  demoUserEmail: string,
): AppPrincipal {
  const user = findUserByEmail(conn, demoUserEmail);
  if (!user) {
    throw new Error(
      `SAPPORTA_DEMO_USER_EMAIL names ${demoUserEmail}, but no account holds that address on this database. Run \`pnpm seed\` to create it, or unset the setting to require sign-in.`,
    );
  }
  return userPrincipal({
    user,
    membership: membershipFromRow(ensureWorkspaceMembership(conn, user)),
  });
}

export function userFromSessionPayload(
  payload: BetterAuthSessionPayload,
): SapportaAuthUser {
  return {
    id: payload.user.id,
    name: payload.user.name ?? null,
    email: payload.user.email,
    emailVerified: payload.user.emailVerified,
  };
}

async function getSessionPayload(
  auth: BetterAuthSessionApi,
  headers: Headers,
): Promise<BetterAuthSessionPayload | null> {
  const session = await auth.getSession({
    headers,
    query: { disableCookieCache: true, disableRefresh: true },
  });
  return isSessionPayload(session) ? session : null;
}

function isSessionPayload(value: unknown): value is BetterAuthSessionPayload {
  if (!isRecord(value)) return false;
  const session = value.session;
  const user = value.user;
  return (
    isRecord(session) &&
    isRecord(user) &&
    typeof session.id === "string" &&
    typeof session.userId === "string" &&
    (session.activeOrganizationId === undefined ||
      session.activeOrganizationId === null ||
      typeof session.activeOrganizationId === "string") &&
    typeof user.id === "string" &&
    typeof user.email === "string" &&
    typeof user.emailVerified === "boolean" &&
    (user.name === undefined ||
      user.name === null ||
      typeof user.name === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
