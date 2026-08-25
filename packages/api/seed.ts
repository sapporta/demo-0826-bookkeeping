/**
 * Sample data for development.
 *
 *   pnpm seed
 *
 * Fills a fresh database with a household's books: a chart of accounts, the
 * payees they deal with, about eight months of entries ending today, and a
 * budget for each expense account in each of those months. Entries go
 * through the same workflow the entry form uses, so every transaction here
 * balances the way a recorded one does.
 *
 * The account is created on the first run and signed in to afterwards; sign
 * in as it to see the data in the browser. A second run writes nothing.
 */
import { deviceTimeZone, Temporal } from "@sapporta/shared/temporal";
import {
  roundMoney,
  type AccountType,
  type EntryBody,
  type EntrySplit,
} from "bookkeeping-shared";
import { createEntry } from "./modules/ledger/save-entry.js";
import { accounts } from "./schema/accounts.js";
import { budgets } from "./schema/budgets.js";
import { payees } from "./schema/payees.js";
import { openSeedRuntime } from "./seed-runtime.js";

const SAMPLE_DATA_ACCOUNT = {
  name: "Test User",
  email: "test@example.com",
  password: "test1234",
};

const demo = await openSeedRuntime(SAMPLE_DATA_ACCOUNT);

if ((await demo.rows(accounts).count()) > 0) {
  console.log(`${demo.workspace.name} already has sample data; nothing written.`);
  demo.close();
} else {
  await seed();
  demo.close();
}

async function seed() {
  const ledger = { db: demo.db, auth: demo.auth };

  // A small, repeatable source of variety so amounts and days look lived-in.
  let state = 20260825;
  const random = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  const between = (low: number, high: number) =>
    roundMoney(low + random() * (high - low));
  const pick = <T>(options: readonly T[]): T =>
    options[Math.floor(random() * options.length)] as T;

  // Chart of accounts.
  const account = async (name: string, type: AccountType) =>
    (await demo.rows(accounts).create({ name, type })).id;

  const checking = await account("Checking", "asset");
  const savings = await account("Savings", "asset");
  const cash = await account("Cash", "asset");
  const creditCard = await account("Credit card", "liability");
  const carLoan = await account("Car loan", "liability");
  const openingBalances = await account("Opening balances", "equity");
  const salary = await account("Salary", "income");
  const freelance = await account("Freelance", "income");
  const interest = await account("Interest", "income");
  const rent = await account("Rent", "expense");
  const groceries = await account("Groceries", "expense");
  const diningOut = await account("Dining out", "expense");
  const utilities = await account("Utilities", "expense");
  const transport = await account("Transport", "expense");
  const fuel = await account("Fuel", "expense");
  const insurance = await account("Insurance", "expense");
  const health = await account("Health", "expense");
  const entertainment = await account("Entertainment", "expense");
  const subscriptions = await account("Subscriptions", "expense");
  const clothing = await account("Clothing", "expense");
  const gifts = await account("Gifts", "expense");
  const household = await account("Household", "expense");
  const loanInterest = await account("Loan interest", "expense");

  // Payees, each remembering the account it is usually filed under.
  const payee = async (name: string, default_account_id: number | null) =>
    (await demo.rows(payees).create({ name, default_account_id })).id;

  const acme = await payee("Acme Corp", salary);
  const upwork = await payee("Upwork client", freelance);
  const bank = await payee("First Street Bank", interest);
  const landlord = await payee("Oak Street Apartments", rent);
  const wholeFoods = await payee("Whole Foods", groceries);
  const traderJoes = await payee("Trader Joe's", groceries);
  const target = await payee("Target", household);
  const amazon = await payee("Amazon", household);
  const pge = await payee("Pacific Gas & Electric", utilities);
  const water = await payee("City Water", utilities);
  const comcast = await payee("Comcast", utilities);
  const blueCross = await payee("Blue Cross", insurance);
  const geico = await payee("Geico", insurance);
  const netflix = await payee("Netflix", subscriptions);
  const spotify = await payee("Spotify", subscriptions);
  const chipotle = await payee("Chipotle", diningOut);
  const oliveGarden = await payee("Olive Garden", diningOut);
  const cornerCafe = await payee("Corner Café", diningOut);
  const shell = await payee("Shell", fuel);
  const uber = await payee("Uber", transport);
  const bart = await payee("BART", transport);
  const cvs = await payee("CVS Pharmacy", health);
  const amc = await payee("AMC Theatres", entertainment);
  const zara = await payee("Zara", clothing);
  const autoFinance = await payee("Auto Finance Co", loanInterest);
  const florist = await payee("Bloom & Co Florist", gifts);

  // Entries, month by month, ending today on this machine's calendar.
  const today = Temporal.Now.plainDateISO(deviceTimeZone());
  const firstMonth = today.toPlainYearMonth().subtract({ months: 7 });

  const drafts: EntryBody[] = [];
  const record = (entry: EntryBody) => {
    if (Temporal.PlainDate.compare(entry.date, today) <= 0) drafts.push(entry);
  };
  const expense = (
    date: Temporal.PlainDate,
    payeeId: number,
    from: number,
    splits: EntrySplit[],
    memo = "",
  ) =>
    record({
      kind: "expense",
      date: date.toString(),
      payee: { id: payeeId },
      memo,
      from_account_id: from,
      splits,
    });
  const income = (
    date: Temporal.PlainDate,
    payeeId: number,
    to: number,
    splits: EntrySplit[],
    memo = "",
  ) =>
    record({
      kind: "income",
      date: date.toString(),
      payee: { id: payeeId },
      memo,
      to_account_id: to,
      splits,
    });
  const transfer = (
    date: Temporal.PlainDate,
    from: number,
    to: number,
    amount: number,
    memo = "",
  ) =>
    record({
      kind: "transfer",
      date: date.toString(),
      payee: null,
      memo,
      from_account_id: from,
      to_account_id: to,
      amount,
    });

  // Opening balances: what the household held and owed when the books began.
  const opening = firstMonth.toPlainDate({ day: 1 });
  record({
    kind: "journal",
    date: opening.toString(),
    payee: null,
    memo: "Opening balances",
    lines: [
      { account_id: checking, debit: 4200, credit: 0 },
      { account_id: savings, debit: 12000, credit: 0 },
      { account_id: cash, debit: 150, credit: 0 },
      { account_id: creditCard, debit: 0, credit: 850 },
      { account_id: carLoan, debit: 0, credit: 9600 },
      { account_id: openingBalances, debit: 0, credit: 5900 },
    ],
  });

  let cardBalance = 850;
  for (let offset = 0; offset < 8; offset += 1) {
    const month = firstMonth.add({ months: offset });
    const day = (d: number) => month.toPlainDate({ day: Math.min(d, month.daysInMonth) });
    let cardSpend = 0;
    const onCard = (amount: number) => {
      cardSpend += amount;
      return amount;
    };

    // Pay day, rent, and savings on the first.
    income(day(1), acme, checking, [{ account_id: salary, amount: 2450 }], "Salary");
    expense(day(1), landlord, checking, [{ account_id: rent, amount: 1650 }], "Rent");
    transfer(day(1), checking, savings, 500, "Monthly savings");
    income(day(15), acme, checking, [{ account_id: salary, amount: 2450 }], "Salary");

    // Fixed bills.
    expense(day(3), netflix, creditCard, [{ account_id: subscriptions, amount: onCard(15.49) }]);
    expense(day(5), blueCross, checking, [{ account_id: insurance, amount: 210 }], "Health insurance");
    expense(day(8), pge, checking, [{ account_id: utilities, amount: between(88, 142) }], "Electricity and gas");
    expense(day(9), spotify, creditCard, [{ account_id: subscriptions, amount: onCard(10.99) }]);
    expense(day(12), water, checking, [{ account_id: utilities, amount: between(41, 49) }]);
    expense(day(18), geico, checking, [{ account_id: insurance, amount: 118 }], "Car insurance");
    expense(day(20), comcast, checking, [{ account_id: utilities, amount: 79.99 }], "Internet");

    // The car loan payment: part principal, part interest, one entry.
    const loanInterestDue = roundMoney((9600 - offset * 280) * 0.0049);
    record({
      kind: "journal",
      date: day(10).toString(),
      payee: { id: autoFinance },
      memo: "Car loan payment",
      lines: [
        { account_id: carLoan, debit: 280, credit: 0 },
        { account_id: loanInterest, debit: loanInterestDue, credit: 0 },
        { account_id: checking, debit: 0, credit: roundMoney(280 + loanInterestDue) },
      ],
    });

    // Cash for the month.
    transfer(day(2), checking, cash, 100, "ATM withdrawal");

    // Groceries most weeks, sometimes a split trip through Target.
    for (const d of [4, 11, 17, 24]) {
      const store = pick([wholeFoods, traderJoes, wholeFoods]);
      expense(day(d + Math.floor(random() * 2)), store, creditCard, [
        { account_id: groceries, amount: onCard(between(62, 138)) },
      ]);
    }
    if (offset % 2 === 0) {
      expense(
        day(13),
        target,
        creditCard,
        [
          { account_id: groceries, amount: onCard(between(40, 90)) },
          { account_id: household, amount: onCard(between(20, 60)) },
        ],
        "Groceries and cleaning supplies",
      );
    } else {
      expense(
        day(19),
        amazon,
        creditCard,
        [
          { account_id: household, amount: onCard(between(25, 70)) },
          { account_id: subscriptions, amount: onCard(14.99) },
        ],
        "Household order and Prime",
      );
    }

    // Eating out, getting around, and the odd pharmacy stop.
    for (let i = 0; i < 3 + Math.floor(random() * 3); i += 1) {
      const spot = pick([chipotle, oliveGarden, cornerCafe]);
      const amount = spot === oliveGarden ? between(38, 72) : between(9, 26);
      if (spot === cornerCafe && random() < 0.5) {
        expense(day(3 + Math.floor(random() * 25)), spot, cash, [{ account_id: diningOut, amount }]);
      } else {
        expense(day(3 + Math.floor(random() * 25)), spot, creditCard, [
          { account_id: diningOut, amount: onCard(amount) },
        ]);
      }
    }
    for (let i = 0; i < 2 + Math.floor(random() * 2); i += 1) {
      expense(day(2 + Math.floor(random() * 26)), shell, creditCard, [
        { account_id: fuel, amount: onCard(between(44, 71)) },
      ]);
    }
    for (let i = 0; i < 1 + Math.floor(random() * 3); i += 1) {
      const ride = pick([uber, bart]);
      expense(day(2 + Math.floor(random() * 26)), ride, ride === bart ? cash : creditCard, [
        { account_id: transport, amount: ride === bart ? between(6, 12) : onCard(between(14, 34)) },
      ]);
    }
    if (random() < 0.6) {
      expense(day(7 + Math.floor(random() * 20)), cvs, creditCard, [
        { account_id: health, amount: onCard(between(12, 46)) },
      ]);
    }
    if (random() < 0.5) {
      expense(day(6 + Math.floor(random() * 20)), amc, creditCard, [
        { account_id: entertainment, amount: onCard(28.5) },
      ], "Movie night");
    }
    if (offset % 3 === 1) {
      expense(day(14 + Math.floor(random() * 10)), zara, creditCard, [
        { account_id: clothing, amount: onCard(between(58, 145)) },
      ]);
    }
    if (offset % 4 === 2) {
      expense(day(12), florist, creditCard, [{ account_id: gifts, amount: onCard(between(45, 85)) }], "Birthday flowers");
    }

    // Freelance work some months, paid to checking.
    if (offset % 3 === 2) {
      income(day(22), upwork, checking, [{ account_id: freelance, amount: pick([750, 900, 1200]) }], "Contract invoice");
    }

    // Pay off the card as it stood at the start of the month; the bank pays
    // interest on savings at the end of it.
    transfer(day(25), checking, creditCard, roundMoney(cardBalance), "Credit card payment");
    cardBalance = roundMoney(cardSpend);
    income(day(month.daysInMonth), bank, savings, [{ account_id: interest, amount: between(11, 14) }], "Savings interest");
  }

  drafts.sort((a, b) => Temporal.PlainDate.compare(a.date, b.date));
  for (const entry of drafts) createEntry(ledger, entry);

  // A budget for every expense account in every month the books cover.
  const monthlyBudget: Record<number, number> = {
    [rent]: 1650,
    [groceries]: 450,
    [diningOut]: 180,
    [utilities]: 260,
    [transport]: 80,
    [fuel]: 160,
    [insurance]: 330,
    [health]: 60,
    [entertainment]: 60,
    [subscriptions]: 45,
    [clothing]: 100,
    [gifts]: 50,
    [household]: 150,
    [loanInterest]: 50,
  };
  let budgetRows = 0;
  for (let offset = 0; offset < 8; offset += 1) {
    const month = firstMonth.add({ months: offset }).toString();
    for (const [accountId, amount] of Object.entries(monthlyBudget)) {
      await demo.rows(budgets).create({ account_id: Number(accountId), month, amount });
      budgetRows += 1;
    }
  }

  console.log(`Seeded ${demo.workspace.name}.`);
  console.log(
    `Wrote 23 accounts, 26 payees, ${drafts.length} transactions, and ${budgetRows} budgets.`,
  );
  console.log(
    `Sign in as ${SAMPLE_DATA_ACCOUNT.email}, with the password written in packages/api/seed.ts.`,
  );
}
