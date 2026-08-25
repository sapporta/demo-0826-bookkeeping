import { ArrowLeft, KeyRound } from "lucide-react";
import { Link } from "react-router-dom";
import { buttonVariants } from "@sapporta/ui/button";
import { AppPage } from "@sapporta/frontend/layout";

/**
 * Stands in for Sapporta's change-password screen, which cannot work here.
 *
 * Changing a password is Better Auth's own route, and it asks for the session
 * cookie of the person whose password is changing. This demo issues no such
 * cookie: `SAPPORTA_DEMO_USER_EMAIL` has the API answer every request as the
 * sample account, so the route replies `401` however the form is filled in.
 *
 * The profile page still offers the button, because that page is Sapporta's
 * and an ordinary app's profile should. `SapportaRoutes.tsx` points the route
 * it leads to here, so a visitor who presses it reads why rather than a
 * failure they are meant to make sense of.
 */
export function DemoPasswordNotice() {
  return (
    <AppPage title="Change password">
      <div className="mx-auto w-full max-w-[760px] px-6 py-8">
        <Link
          className={buttonVariants({
            variant: "ghost",
            className: "-ml-3 mb-4",
          })}
          to="/account/profile"
        >
          <ArrowLeft data-icon="inline-start" />
          Back to profile
        </Link>

        <div className="flex items-start gap-3">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-[7px] bg-sap-active-nav text-sap-brand">
            <KeyRound className="size-5" strokeWidth={1.7} />
          </span>
          <div className="min-w-0 max-w-[420px]">
            <p className="mt-1 text-sap-body text-sap-muted">
              Not in the demo. Everyone here shares one sample account, signed
              in for them by the server, so there is no password of their own
              to change - and changing the shared one would lock out the next
              visitor.
            </p>
            <p className="mt-3 text-sap-body text-sap-muted">
              Your own Sapporta app has this screen in full: current password,
              new password, and the option to end your other sessions.
            </p>
          </div>
        </div>
      </div>
    </AppPage>
  );
}
