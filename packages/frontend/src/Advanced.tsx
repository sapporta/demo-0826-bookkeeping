/**
 * Everything the shell can reach, in one place: direct table access, every
 * report, and the account and workspace settings. Owner-only destinations
 * show only to owners; each destination still enforces its own authorization.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "@sapporta/frontend/auth/runtime";
import { AppPage } from "@sapporta/frontend/layout";
import { useSchemaStore } from "@sapporta/frontend/schema";

const reports = [
  { label: "Transactions (journal)", to: "/transactions" },
  { label: "Balances", to: "/reports/balances" },
  { label: "Profit & Loss", to: "/reports/profit-loss" },
  { label: "Spending against budget", to: "/reports/spending" },
  { label: "Account by month", to: "/reports/account-months" },
  { label: "Account register", to: "/reports/register" },
];

export function Advanced() {
  const tables = useSchemaStore((state) => state.tables);
  const session = useAuthStore((state) => state.session);
  const isOwner = session.kind === "authenticated" && session.context.role === "owner";

  return (
    <AppPage title="Advanced" bodyClassName="p-5 sm:p-6">
      <div className="grid max-w-[56rem] gap-8 sm:grid-cols-3">
        <Group heading="Tables">
          {tables.map((table) => (
            <Item key={table.name} to={`/tables/${table.name}`}>
              {table.label}
            </Item>
          ))}
        </Group>
        <Group heading="Reports">
          {reports.map((report) => (
            <Item key={report.to} to={report.to}>
              {report.label}
            </Item>
          ))}
        </Group>
        <Group heading="Settings">
          <Item to="/account/profile">Account profile</Item>
          <Item to="/account/password">Change password</Item>
          {isOwner ? <Item to="/workspace/settings">Workspace settings</Item> : null}
        </Group>
      </div>
      <p className="mt-8 max-w-[40rem] text-sap-data leading-5 text-sap-muted">
        Tables show stored rows directly. Postings cannot be edited or deleted
        one at a time, because a transaction's postings must stay balanced;
        change them by editing the entry from Transactions.
      </p>
    </AppPage>
  );
}

function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-sap-label font-bold uppercase tracking-sap-section text-sap-muted">
        {heading}
      </h2>
      <ul className="mt-3 flex flex-col gap-1.5">{children}</ul>
    </section>
  );
}

function Item({ to, children }: { to: string; children: ReactNode }) {
  return (
    <li>
      <Link to={to} className="text-sap-body text-sap-link hover:underline">
        {children}
      </Link>
    </li>
  );
}
