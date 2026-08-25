/**
 * The screen at `/`: what to do here, in the order you'd do it, with the
 * link that starts each step. How double-entry actually works sits at the
 * bottom, for whoever wants it.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AppPage } from "@sapporta/frontend/layout";
import { buttonVariants } from "@sapporta/ui/button";
import { cn } from "@sapporta/ui/cn";

const sapportaUrl = "https://sapporta.com";
const repoUrl = "https://github.com/sapporta/demo-0826-bookkeeping";

export function Home() {
  return (
    <AppPage title="Home" bodyClassName="bg-sap-bg text-sap-fg">
      <div className="mx-auto max-w-[44rem] px-5 py-8 sm:px-8 sm:py-10">
        <DemoNotice />

        <header className="mt-8">
          <h1 className="text-[22px] font-[680] leading-tight text-sap-soft">
            Double-entry Bookkeeping
          </h1>
        </header>

        <Section
          heading="Record what happened"
          action={<PrimaryLink to="/transactions/new">New entry</PrimaryLink>}
          secondary={<QuietLink to="/transactions">Open transactions</QuietLink>}
        >
          Pick expense, income, or transfer, fill in the accounts on each
          side, and save. One purchase can split across several categories.
        </Section>

        <Section
          heading="See how the month is going"
          action={<PrimaryLink to="/reports/spending">Open spending</PrimaryLink>}
          secondary={<QuietLink to="/tables/budgets">Set budgets</QuietLink>}
        >
          Spending lines every expense account up against its budget. Set a
          budget for the ones you want to keep an eye on.
        </Section>

        <Section
          heading="Check where you stand"
          action={<PrimaryLink to="/reports/balances">Open balances</PrimaryLink>}
          secondary={<QuietLink to="/reports/cash-flow">Open cash flow</QuietLink>}
        >
          Balances is what you own and owe today; cash flow is income against
          expenses. Open any account to see every entry that touched it.
        </Section>

        <Section
          heading="Make it yours"
          action={<PrimaryLink to="/tables/accounts">Open accounts</PrimaryLink>}
          secondary={<QuietLink to="/tables/payees">Open payees</QuietLink>}
        >
          Your income and expense accounts double as categories, so there's no
          separate list to keep. Give a payee a default account and it fills
          that in for you next time.
        </Section>

        <HowItWorks />
      </div>
    </AppPage>
  );
}

/**
 * What this deployment is, before anyone mistakes it for their own books.
 */
function DemoNotice() {
  return (
    <aside className="rounded-[8px] border border-sap-border bg-sap-brand-soft px-4 py-3.5">
      <p className="text-[14px] leading-6 text-sap-soft">
        <span className="mr-2 align-[1px] text-sap-label font-bold uppercase tracking-sap-head text-sap-brand">
          Demo
        </span>
        A demo app for the{" "}
        <a
          href={sapportaUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sap-link hover:underline"
        >
          Sapporta
        </a>{" "}
        framework, generated with Fable.{" "}
        <a
          href={repoUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sap-link hover:underline"
        >
          Source on GitHub
        </a>
        .
      </p>
      <p className="mt-1 text-[12.5px] leading-5 text-sap-muted">
        You're signed in as a public demo user, and the data is reset
        periodically.
      </p>
    </aside>
  );
}

/**
 * The double-entry idea, once, for whoever scrolls this far.
 */
function HowItWorks() {
  return (
    <section className="mt-10 border-t border-sap-border-soft pt-6">
      <h2 className="text-[13px] font-[680] text-sap-soft">How it works</h2>
      <p className="mt-2 max-w-[40rem] text-[13px] leading-6 text-sap-muted">
        Every entry moves money between two accounts — groceries leave your
        bank account and land in Groceries, salary arrives from Salary, a
        transfer moves one balance to another. Both sides always match, which
        is why balances, cash flow, and spending can all be read from the same
        entries. If you'd rather write the two sides yourself, that's what a
        journal entry is for.
      </p>
    </section>
  );
}

function Section({
  heading,
  action,
  secondary,
  children,
}: {
  heading: string;
  action: ReactNode;
  secondary?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-8 border-t border-sap-border-soft pt-6">
      <h2 className="text-[16px] font-[680] text-sap-soft">{heading}</h2>
      <p className="mt-2 max-w-[40rem] text-[14px] leading-6 text-sap-muted">{children}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {action}
        {secondary}
      </div>
    </section>
  );
}

function PrimaryLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={cn(buttonVariants(), "no-underline")}>
      {children}
    </Link>
  );
}

function QuietLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={cn(buttonVariants({ variant: "ghost" }), "no-underline")}>
      {children}
    </Link>
  );
}
