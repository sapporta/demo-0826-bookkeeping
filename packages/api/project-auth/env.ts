import type { HealthPolicy, OpenApiPolicy } from "@sapporta/server";
import { parseBoundedInteger } from "@sapporta/shared/validation";

export type Origin = string & { readonly __origin: unique symbol };

/**
 * The origin a browser loads the app from — used for sign-in trust and for
 * links in outgoing email. A public identity, not a local address: a
 * deployment sets it to the site's own domain, while SAPPORTA_API_PORT is
 * merely where this process listens behind a proxy. It carries
 * SAPPORTA_FRONTEND_PORT in development only because Vite serves the app
 * there. Do not derive it from a port.
 */
export type PublicAppUrl = Origin & {
  readonly __publicAppUrl: unique symbol;
};

export interface ProjectAuthEnv {
  apiPort: number;
  betterAuthSecret: string;
  publicAppUrl: PublicAppUrl;
  trustedOrigins: Origin[];
  requireVerifiedEmail: boolean;
  demoUserEmail: string | null;
  healthPolicy: HealthPolicy;
  openapiPolicy: OpenApiPolicy;
  mail: ProjectMailConfig;
}

export type MailTransportKind = "stream" | "smtp" | "disabled";

export type ProjectMailConfig =
  | {
      from: string;
      transport: "stream" | "disabled";
    }
  | {
      from: string;
      transport: "smtp";
      smtp: ProjectSmtpConfig;
    };

export type ProjectSmtpConfig =
  | { url: string }
  | {
      host: string;
      port: number;
      secure: boolean;
      auth?: { user: string; pass: string };
    };

export function readProjectAuthEnv(
  env: NodeJS.ProcessEnv = process.env,
): ProjectAuthEnv {
  const publicAppUrl = readRequiredPublicAppUrl(env);
  return {
    apiPort: resolveApiPort(env),
    betterAuthSecret: readRequiredEnv(env, "BETTER_AUTH_SECRET"),
    publicAppUrl,
    trustedOrigins: readTrustedOrigins(env, publicAppUrl),
    requireVerifiedEmail: isEmailVerificationRequired({
      explicitRequirement: readOptionalBooleanEnv(
        env.SAPPORTA_REQUIRE_VERIFIED_EMAIL,
        "SAPPORTA_REQUIRE_VERIFIED_EMAIL",
      ),
      nodeEnv: env.NODE_ENV,
    }),
    demoUserEmail: readDemoUserEmail(env),
    healthPolicy: readHealthPolicy(env.SAPPORTA_HEALTH_POLICY),
    openapiPolicy: readOpenApiPolicy(env.SAPPORTA_OPENAPI_POLICY),
    mail: readMailConfig(env),
  };
}

export function isEmailVerificationRequired({
  explicitRequirement,
  nodeEnv,
}: {
  explicitRequirement: boolean | undefined;
  nodeEnv: string | undefined;
}): boolean {
  return explicitRequirement ?? nodeEnv === "production";
}

/**
 * The account a request that carries no credential is served as.
 *
 * Set, this address signs the whole API in: every request without a session
 * cookie or a bearer token is answered as this account, and the sign-in pages
 * become unreachable because nothing ever asks for them. That is what a public
 * demo wants and what no other deployment does, so the setting has to be
 * granted rather than merely not withheld - an environment that never heard of
 * `SAPPORTA_DEMO_USER_EMAIL` requires sign-in, which is the behavior every
 * deployment gets by default.
 *
 * Unlike `SAPPORTA_ALLOW_SAMPLE_DATA_SEEDING`, this deliberately still works
 * under `NODE_ENV=production`: a demo on a public site is a production
 * deployment, and refusing there would leave the setting useful only where it
 * is not needed. Naming an address is the whole grant, so an environment file
 * that carries this line is saying the data behind it is sample data.
 */
function readDemoUserEmail(env: NodeJS.ProcessEnv): string | null {
  const email = env.SAPPORTA_DEMO_USER_EMAIL?.trim();
  return email ? email : null;
}

function readMailConfig(env: NodeJS.ProcessEnv): ProjectMailConfig {
  const from = readRequiredEnv(env, "SAPPORTA_MAIL_FROM");
  const transport = readMailTransport(env.SAPPORTA_MAIL_TRANSPORT);

  if (transport === "stream" || transport === "disabled") {
    return { from, transport };
  }

  return {
    from,
    transport,
    smtp: readSmtpConfig(env),
  };
}

function readMailTransport(value: string | undefined): MailTransportKind {
  if (value === undefined || value === "") return "stream";
  if (value === "stream" || value === "smtp" || value === "disabled") {
    return value;
  }
  throw new Error(
    'SAPPORTA_MAIL_TRANSPORT must be "stream", "smtp", or "disabled".',
  );
}

function readSmtpConfig(env: NodeJS.ProcessEnv): ProjectSmtpConfig {
  if (env.SMTP_URL) return { url: env.SMTP_URL };

  const host = readRequiredEnv(env, "SMTP_HOST");
  const port = readRequiredIntegerEnv(env, "SMTP_PORT");
  const secure = readBooleanEnv(env.SMTP_SECURE, "SMTP_SECURE", false);
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;

  return {
    host,
    port,
    secure,
    auth: user || pass ? { user: user ?? "", pass: pass ?? "" } : undefined,
  };
}

function readRequiredEnv(
  env: NodeJS.ProcessEnv,
  name: keyof NodeJS.ProcessEnv,
): string {
  const value = env[name];
  if (value) return value;
  throw new Error(`Project auth requires ${name}.`);
}

function readRequiredPublicAppUrl(env: NodeJS.ProcessEnv): PublicAppUrl {
  return parsePublicAppUrl(readRequiredEnv(env, "SAPPORTA_PUBLIC_APP_URL"));
}

function resolveApiPort(env: NodeJS.ProcessEnv): number {
  const sapportaPort = readOptionalIntegerEnv(env, "SAPPORTA_API_PORT");
  const platformPort = readOptionalIntegerEnv(env, "PORT");

  if (
    sapportaPort !== undefined &&
    platformPort !== undefined &&
    sapportaPort !== platformPort
  ) {
    throw new Error(
      `SAPPORTA_API_PORT and PORT must match when both are set; received ${sapportaPort} and ${platformPort}.`,
    );
  }

  return sapportaPort ?? platformPort ?? 3000;
}

function readBooleanEnv(
  value: string | undefined,
  name: string,
  fallback: boolean,
): boolean {
  return readOptionalBooleanEnv(value, name) ?? fallback;
}

function readOptionalBooleanEnv(
  value: string | undefined,
  name: string,
): boolean | undefined {
  if (value === undefined || value === "") return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be "true" or "false".`);
}

function readHealthPolicy(value: string | undefined): HealthPolicy {
  if (value === undefined || value === "") return "public";
  if (value === "disabled" || value === "authenticated" || value === "public") {
    return value;
  }
  throw new Error(
    'SAPPORTA_HEALTH_POLICY must be "public", "authenticated", or "disabled".',
  );
}

/**
 * Read who may fetch the generated app contract at `/api/openapi.json`.
 *
 * Unset means `"authenticated"`, so a deployment that says nothing keeps the
 * contract behind sign-in. The generated `.env.development` sets `public`,
 * which is what makes `sapporta endpoints list` work against a local dev
 * server with no access token.
 */
function readOpenApiPolicy(value: string | undefined): OpenApiPolicy {
  if (value === undefined || value === "") return "authenticated";
  if (value === "disabled" || value === "authenticated" || value === "public") {
    return value;
  }
  throw new Error(
    'SAPPORTA_OPENAPI_POLICY must be "public", "authenticated", or "disabled".',
  );
}

function readTrustedOrigins(
  env: NodeJS.ProcessEnv,
  publicAppUrl: PublicAppUrl,
): Origin[] {
  return uniqueOrigins([
    parseOrigin(publicAppUrl, "SAPPORTA_PUBLIC_APP_URL"),
    ...readOrigins(env.SAPPORTA_FRONTEND_ORIGINS, "SAPPORTA_FRONTEND_ORIGINS"),
  ]);
}

function readOrigins(value: string | undefined, name: string): Origin[] {
  if (value === undefined || value === "") return [];
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => parseOrigin(origin, name));
}

function readRequiredIntegerEnv(
  env: NodeJS.ProcessEnv,
  name: keyof NodeJS.ProcessEnv,
): number {
  const value = readRequiredEnv(env, name);
  return parseIntegerEnv(value, String(name));
}

function readOptionalIntegerEnv(
  env: NodeJS.ProcessEnv,
  name: keyof NodeJS.ProcessEnv,
): number | undefined {
  const value = env[name];
  if (value === undefined || value === "") return undefined;
  return parseIntegerEnv(value, String(name));
}

function parseIntegerEnv(value: string, name: string): number {
  return parseBoundedInteger(value, {
    name,
    min: 0,
    defaultValue: 0,
    makeError: () => new Error(`${name} must be an integer.`),
  });
}

function parsePublicAppUrl(value: string): PublicAppUrl {
  return parseOrigin(value, "SAPPORTA_PUBLIC_APP_URL") as PublicAppUrl;
}

function parseOrigin(value: string, name: string): Origin {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must contain valid URL origins.`);
  }

  if (url.origin !== value || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(
      `${name} must contain origins only, such as https://app.example.com.`,
    );
  }
  return url.origin as Origin;
}

function uniqueOrigins(origins: Origin[]): Origin[] {
  return Array.from(new Set(origins));
}
