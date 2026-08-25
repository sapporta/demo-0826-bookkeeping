import { Link } from "react-router-dom";
import {
  getAccountDisplayName,
  getAccountInitials,
  getAccountSecondaryLabel,
} from "@sapporta/frontend/shell";
import { useAuthStore } from "@sapporta/frontend/auth/runtime";

/**
 * The sidebar footer for this demo: who the books belong to, and a way to the
 * profile page.
 *
 * Sapporta puts its account menu here, and an app with people in it wants
 * that. This one has no people: `SAPPORTA_DEMO_USER_EMAIL` makes the API
 * answer every request as the sample account, so a visitor is signed in before
 * they arrive, cannot become anyone else, and cannot leave - logging out would
 * end nothing, because the next request arrives signed in again. A menu whose
 * one destructive action does nothing is worse than no menu, so the account
 * block goes straight to the page the menu's first entry led to.
 *
 * What is left worth saying is which account and workspace the numbers on
 * screen belong to. It reads the same three facts the account menu's own
 * trigger reads, through Sapporta's helpers, so the name and workspace line
 * read identically to a real app's, and it carries that trigger's shape and
 * hover so a visitor can tell it is something to press.
 *
 * `SapportaApp.tsx` passes it as `sidebarFooter`.
 */
export function DemoAccountStatus() {
  const session = useAuthStore((s) => s.session);
  if (session.kind !== "authenticated") return null;

  const { context } = session;

  return (
    <Link
      to="/account/profile"
      title="Account and workspace details"
      className="flex w-full items-center gap-2 rounded-[6px] px-2 py-[7px] text-left no-underline hover:bg-sap-row-hover"
    >
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-sap-active-nav text-sap-label font-bold text-sap-brand">
        {getAccountInitials(context.user)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sap-body font-[650] text-sap-fg">
          {getAccountDisplayName(context.user)}
        </span>
        <span className="block truncate text-sap-menu font-normal text-sap-muted">
          {getAccountSecondaryLabel(context)}
        </span>
      </span>
      <span className="shrink-0 rounded-[4px] border border-sap-border-soft px-1.5 py-0.5 text-sap-micro font-semibold uppercase tracking-sap-label text-sap-subtle">
        Demo
      </span>
    </Link>
  );
}
