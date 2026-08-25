/**
 * The screen at `/`: what the app is for, where to begin, what comes next,
 * and where to look at the result.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AppPage } from "@sapporta/frontend/layout";
import { buttonVariants } from "@sapporta/ui/button";
import { cn } from "@sapporta/ui/cn";

export function Home() {
  return (
    <AppPage title="Home" bodyClassName="bg-sap-bg text-sap-fg">
      <div className="mx-auto max-w-[44rem] px-5 py-8 sm:px-8 sm:py-10">
        <header>
          <h1 className="text-[22px] font-[680] leading-tight text-sap-soft">
            Household books, kept double-entry
          </h1>
          <p className="mt-3 text-[14px] leading-6 text-sap-muted">
            Every entry moves money between accounts: an expense leaves a bank
            account and lands in an expense account such as Groceries, income
            arrives from Salary, a transfer goes from one balance to another.
            Because each entry balances, balances, cash flow, and spending are
            all read from the same postings.
          </p>
        </header>

        <Section
          heading="Set up the chart of accounts"
          action={<PrimaryLink to="/tables/accounts">Open accounts</PrimaryLink>}
          secondary={<QuietLink to="/tables/payees">Open payees</QuietLink>}
        >
          Asset, liability, and equity accounts hold balances. Income and
          expense accounts are the categories entries are filed under, so there
          is no separate category list. A payee remembers the account it is
          usually filed under, which fills in the category on the next entry.
        </Section>

        <Section
          heading="Record what happened"
          action={<PrimaryLink to="/transactions/new">New entry</PrimaryLink>}
          secondary={<QuietLink to="/transactions">Open transactions</QuietLink>}
        >
          Record an expense, income, or a transfer with the accounts on each
          side; one purchase can be split across several expense accounts. For
          anything else, a journal entry takes the accounts and debit or credit
          amounts directly, as long as they balance. Every entry is saved with
          its postings and can be reopened from Transactions.
        </Section>

        <Section
          heading="Review the month"
          action={<PrimaryLink to="/reports/spending">Open spending</PrimaryLink>}
          secondary={<QuietLink to="/tables/budgets">Set budgets</QuietLink>}
        >
          Spending puts each expense account beside its budget for the month.
          Budgets are one amount per expense account per month; an account
          without one still shows what was spent.
        </Section>

        <Section
          heading="Check where you stand"
          action={<PrimaryLink to="/reports/balances">Open balances</PrimaryLink>}
          secondary={<QuietLink to="/reports/cash-flow">Open cash flow</QuietLink>}
        >
          Balances shows every account as of a day and the net worth they add
          up to. Cash flow shows income against expenses over a period. From
          either, an account opens its register: every posting in order with a
          running balance, and each posting opens the entry that made it.
        </Section>
      </div>
    </AppPage>
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
