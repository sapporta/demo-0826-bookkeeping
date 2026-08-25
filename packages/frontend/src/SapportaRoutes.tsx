import { lazy, Suspense, useEffect, useState } from "react";
import { Route } from "react-router-dom";
import { NotFoundView } from "@sapporta/frontend/app";
import { PublicOnlyGate, useAuthStore } from "@sapporta/frontend/auth/runtime";
import { DemoPasswordNotice } from "./DemoPasswordNotice";

/**
 * These are Sapporta's account and table routes. The table pages use
 * `:tableName` and the metadata loaded by `BootLoader` to render the standard
 * grid and form.
 *
 * Three of them are exceptions, because this deployment is a demo that serves
 * every request as the sample account: sign-in and sign-up have nothing to ask
 * a visitor for, so `DemoSession` stands in for both, and changing a password
 * cannot work without a session of one's own, so `DemoPasswordNotice` stands
 * in for that.
 */

// Load each supplied screen only when its URL is visited.
const VerifyEmailPage = lazy(() =>
  import("@sapporta/frontend/auth/pages").then((m) => ({
    default: m.VerifyEmailPage,
  })),
);
const ForgotPasswordPage = lazy(() =>
  import("@sapporta/frontend/auth/pages").then((m) => ({
    default: m.ForgotPasswordPage,
  })),
);
const ResetPasswordPage = lazy(() =>
  import("@sapporta/frontend/auth/pages").then((m) => ({
    default: m.ResetPasswordPage,
  })),
);
const AccountProfilePage = lazy(() =>
  import("@sapporta/frontend/auth/profile").then((m) => ({
    default: m.AccountProfilePage,
  })),
);
const WorkspaceSettingsPage = lazy(() =>
  import("@sapporta/frontend/auth/profile").then((m) => ({
    default: m.WorkspaceSettingsPage,
  })),
);
const TableRoute = lazy(() =>
  import("@sapporta/frontend/routes/table").then((m) => ({
    default: m.TableRoute,
  })),
);
const NewRecordRoute = lazy(() =>
  import("@sapporta/frontend/routes/new-record").then((m) => ({
    default: m.NewRecordRoute,
  })),
);

function RouteFallback() {
  return (
    <div className="p-[18px] text-sap-data text-sap-muted">Loading...</div>
  );
}

/**
 * Stands in for the sign-in and sign-up screens, which this demo has no use
 * for.
 *
 * `SAPPORTA_DEMO_USER_EMAIL` makes the API answer a request with no credential
 * as the sample account, so a visitor is signed in before they arrive and
 * there is nothing here to ask them for. The routes still exist because
 * `AuthGate` still sends a visitor here whenever the session reads as a guest,
 * which in this demo means a request that failed rather than a person who
 * signed out. Reading the session once more is all signing in means now, and
 * `PublicOnlyGate` returns them to the page they came from as soon as it
 * settles.
 *
 * A visitor who lands here and stays is looking at a misconfigured demo, so
 * this says which setting is missing rather than spinning forever.
 */
function DemoSession() {
  const session = useAuthStore((s) => s.session);
  const reloadSession = useAuthStore((s) => s.reloadSession);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    void reloadSession().finally(() => setSettled(true));
  }, [reloadSession]);

  if (!settled || session.kind === "loading") return <RouteFallback />;
  return (
    <div className="p-[18px] text-sap-data text-sap-muted">
      This demo signs itself in, and could not this time. Set
      SAPPORTA_DEMO_USER_EMAIL to an account that exists on this database, run
      `pnpm seed` if it does not, and reload.
    </div>
  );
}

export const sapportaPublicRoutes = (
  <>
    <Route
      path="login"
      element={
        <PublicOnlyGate>
          <DemoSession />
        </PublicOnlyGate>
      }
    />
    <Route
      path="signup"
      element={
        <PublicOnlyGate>
          <DemoSession />
        </PublicOnlyGate>
      }
    />
    <Route
      path="verify-email"
      element={
        <Suspense fallback={<RouteFallback />}>
          <VerifyEmailPage />
        </Suspense>
      }
    />
    <Route
      path="forgot-password"
      element={
        <Suspense fallback={<RouteFallback />}>
          <ForgotPasswordPage />
        </Suspense>
      }
    />
    <Route
      path="reset-password"
      element={
        <Suspense fallback={<RouteFallback />}>
          <ResetPasswordPage />
        </Suspense>
      }
    />
  </>
);

export const sapportaProtectedRoutes = (
  <>
    <Route
      path="account/profile"
      element={
        <Suspense fallback={<RouteFallback />}>
          <AccountProfilePage />
        </Suspense>
      }
    />
    <Route
      path="account/password"
      element={<DemoPasswordNotice />}
    />
    <Route
      path="workspace/settings"
      element={
        <Suspense fallback={<RouteFallback />}>
          <WorkspaceSettingsPage />
        </Suspense>
      }
    />
    <Route
      path="tables/:tableName/new"
      element={
        <Suspense fallback={<RouteFallback />}>
          <NewRecordRoute />
        </Suspense>
      }
    />
    <Route
      path="tables/:tableName"
      element={
        <Suspense fallback={<RouteFallback />}>
          <TableRoute />
        </Suspense>
      }
    />
  </>
);

export const sapportaNotFoundRoute = (
  <Route path="*" element={<NotFoundView />} />
);
