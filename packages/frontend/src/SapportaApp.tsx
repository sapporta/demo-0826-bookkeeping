import { useEffect } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import { AppShell, setNavigate } from "@sapporta/frontend/app";
import { BootLoader } from "@sapporta/frontend/app";
import { AuthGate } from "@sapporta/frontend/auth/runtime";
import {
  appHomeRoute,
  appNavigation,
  appProtectedRoutes,
  appPublicHomeRoute,
  appPublicRoutes,
} from "./App";
import {
  sapportaNotFoundRoute,
  sapportaProtectedRoutes,
  sapportaPublicRoutes,
} from "./SapportaRoutes";
import { DemoAccountStatus } from "./DemoAccountStatus";

/**
 * This component joins the application UI with Sapporta's supplied UI.
 * `BootLoader` loads the session and table metadata. `AppShell` renders the
 * layout and table navigation. The route tree combines `App.tsx` with the
 * account and table pages in `SapportaRoutes.tsx`.
 *
 * `sidebarFooter` replaces the account menu Sapporta puts under the
 * navigation with an account block that links to the profile page, because
 * this demo signs everyone in as one account and has no sign-out to offer.
 * See `DemoAccountStatus.tsx`.
 *
 * `/` opens the home page behind `AuthGate`, so a visitor without a session
 * goes to the sign-in page and returns to `/` afterwards. An app that opens `/`
 * to everyone fills `appPublicHomeRoute` in `App.tsx` instead.
 */
export interface SapportaAppProps {
  // Show table links generated from the loaded schema.
  showFrameworkNavigation?: boolean;
}

export function SapportaApp({
  showFrameworkNavigation = true,
}: SapportaAppProps) {
  const navigate = useNavigate();

  useEffect(() => {
    setNavigate(navigate);
  }, [navigate]);

  return (
    <Routes>
      {sapportaPublicRoutes}

      <Route
        element={
          <BootLoader>
            <AppShell
              navigation={appNavigation}
              showFrameworkNavigation={showFrameworkNavigation}
              sidebarFooter={<DemoAccountStatus />}
            />
          </BootLoader>
        }
      >
        {appPublicHomeRoute}
        {appPublicRoutes}
        <Route element={<AuthGate />}>
          {appPublicHomeRoute ? null : appHomeRoute}
          {appProtectedRoutes}
          {sapportaProtectedRoutes}
        </Route>
        {sapportaNotFoundRoute}
      </Route>
    </Routes>
  );
}
