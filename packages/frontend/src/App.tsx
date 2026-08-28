import { lazy, Suspense } from "react";
import { Route } from "react-router-dom";
import type { Navigation } from "@sapporta/frontend/shell";
import { AppPage } from "@sapporta/frontend/layout";
import {
  BookOpen,
  ChartNoAxesColumn,
  House,
  Landmark,
  ListOrdered,
  PiggyBank,
  Scale,
  Settings2,
  Store,
  Wallet,
  PenLine,
} from "lucide-react";

/**
 * The application's routes and navigation. `SapportaApp.tsx` combines them
 * with Sapporta's account and table routes.
 */
const homePath = "/";

const Home = lazy(() => import("./Home").then((m) => ({ default: m.Home })));
const Advanced = lazy(() =>
  import("./Advanced").then((m) => ({ default: m.Advanced })),
);
const EntryForm = lazy(() =>
  import("./entries/EntryForm").then((m) => ({ default: m.EntryForm })),
);
const Journal = lazy(() =>
  import("./reports/Journal").then((m) => ({ default: m.Journal })),
);
const Balances = lazy(() =>
  import("./reports/Balances").then((m) => ({ default: m.Balances })),
);
const ProfitLoss = lazy(() =>
  import("./reports/ProfitLoss").then((m) => ({ default: m.ProfitLoss })),
);
const Spending = lazy(() =>
  import("./reports/Spending").then((m) => ({ default: m.Spending })),
);
const AccountMonths = lazy(() =>
  import("./reports/AccountMonths").then((m) => ({ default: m.AccountMonths })),
);
const Register = lazy(() =>
  import("./reports/Register").then((m) => ({ default: m.Register })),
);

function RouteFallback() {
  return (
    <AppPage
      title="Loading"
      bodyClassName="p-[18px] text-sap-data text-sap-muted"
    >
      Loading...
    </AppPage>
  );
}

function screen(element: React.ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
}

// The everyday path: record entries, review the month, check balances. Set-up
// pages come after the work they support; Advanced lists everything else.
export const appNavigation: Navigation = [
  {
    label: "Record",
    items: [
      { label: "Home", icon: House, to: homePath },
      { label: "New entry", icon: PenLine, to: "/transactions/new" },
      { label: "Transactions", icon: ListOrdered, to: "/transactions" },
    ],
  },
  {
    label: "Review",
    items: [
      { label: "Spending", icon: ChartNoAxesColumn, to: "/reports/spending" },
      { label: "Profit & Loss", icon: Wallet, to: "/reports/profit-loss" },
      { label: "Balances", icon: Scale, to: "/reports/balances" },
      { label: "Account register", icon: BookOpen, to: "/reports/register" },
    ],
  },
  {
    label: "Set up",
    items: [
      { label: "Accounts", icon: Landmark, to: "/tables/accounts" },
      { label: "Payees", icon: Store, to: "/tables/payees" },
      { label: "Budgets", icon: PiggyBank, to: "/tables/budgets" },
    ],
  },
  {
    label: "More",
    items: [{ label: "Advanced", icon: Settings2, to: "/advanced" }],
  },
];

// The screen at `/`. It opens for signed-in users, and it is where they
// arrive after signing in.
export const appHomeRoute = <Route index element={screen(<Home />)} />;

// Set this to an index route when anyone should be able to read `/`. The
// books are private, so it stays empty.
export const appPublicHomeRoute: React.ReactElement | null = null;

// Routes here render without requiring a signed-in session.
export const appPublicRoutes = <></>;

// Routes here render inside the authenticated app shell.
export const appProtectedRoutes = (
  <>
    <Route path="transactions" element={screen(<Journal />)} />
    <Route path="transactions/new" element={screen(<EntryForm mode="new" />)} />
    <Route
      path="transactions/:id/edit"
      element={screen(<EntryForm mode="edit" />)}
    />
    <Route path="reports/balances" element={screen(<Balances />)} />
    <Route path="reports/profit-loss" element={screen(<ProfitLoss />)} />
    <Route path="reports/spending" element={screen(<Spending />)} />
    <Route path="reports/account-months" element={screen(<AccountMonths />)} />
    <Route path="reports/register" element={screen(<Register />)} />
    <Route path="advanced" element={screen(<Advanced />)} />
  </>
);
