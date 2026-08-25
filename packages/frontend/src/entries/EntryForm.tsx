/**
 * The entry form: one screen records an expense, income, a transfer, or a
 * general journal entry, and reopens any stored transaction for editing.
 *
 * The draft lives in TanStack Form. Submit turns it into the entry the
 * server records; the server derives or checks the postings and owns the
 * transaction. Issues — local or from the server — land beside the field
 * they name.
 */
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { reloadTGridRows } from "@sapporta/frontend";
import {
  FormSubmissionError,
  fieldIssuesForSubmissionError,
  firstFormErrorMessage,
} from "@sapporta/frontend/form";
import { AppPage } from "@sapporta/frontend/layout";
import { appTimeZone } from "@sapporta/frontend/platform";
import { tableQueryKeys, tableRecordQueryOptions } from "@sapporta/frontend/table/query";
import { ApiError } from "@sapporta/shared/client";
import type { Row } from "@sapporta/shared/contracts";
import { toRecordId } from "@sapporta/shared/record-id";
import { Temporal } from "@sapporta/shared/temporal";
import { apiProblemFromBody } from "@sapporta/shared/validation";
import { Button, buttonVariants } from "@sapporta/ui/button";
import { cn } from "@sapporta/ui/cn";
import { Input } from "@sapporta/ui/input";
import { Label } from "@sapporta/ui/label";
import {
  BALANCE_ACCOUNT_TYPES,
  ENTRY_KINDS,
  isCategoryAccountType,
  payeeRowSchema,
  type AccountType,
  type EntryBody,
  type EntryKind,
} from "bookkeeping-shared";
import { ledgerApi } from "../api";
import { AccountPicker } from "./AccountPicker";
import { PayeePicker } from "./PayeePicker";
import {
  draftFieldForIssue,
  draftFromTransaction,
  emptyDraft,
  emptyLine,
  emptySplit,
  entryBodyFromDraft,
  journalTotals,
  splitsTotal,
  type EntryDraft,
  type PayeeChoice,
} from "./entry-draft";
import { formatMoney } from "./money";
import { useAccounts } from "./use-accounts";

const transactionsPath = "/transactions";

const KIND_LABELS: Record<EntryKind, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
  journal: "Journal entry",
};

export function EntryForm({ mode }: { mode: "new" | "edit" }) {
  return mode === "new" ? <NewEntry /> : <EditEntry />;
}

function today(): string {
  return Temporal.Now.plainDateISO(appTimeZone()).toString();
}

function NewEntry() {
  const accounts = useAccounts();
  if (accounts.isPending) return <EntryPage title="New entry">Loading accounts…</EntryPage>;
  if (accounts.isError) {
    return (
      <EntryPage title="New entry">
        <p role="alert" className="text-sap-negative">The chart of accounts could not be loaded.</p>
      </EntryPage>
    );
  }
  if (accounts.accounts.length === 0) {
    return (
      <EntryPage title="New entry">
        <p className="text-sap-muted">
          There are no accounts yet. Create the chart of accounts first, then record entries.
        </p>
        <Link className={cn(buttonVariants(), "mt-3 no-underline")} to="/tables/accounts/new">
          Create an account
        </Link>
      </EntryPage>
    );
  }
  return (
    <EntryEditor
      key="entry:new"
      mode="new"
      initial={emptyDraft(today())}
      typeById={accountTypes(accounts.byId)}
    />
  );
}

function EditEntry() {
  const raw = useParams<{ id: string }>().id;
  const id = raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : null;
  if (id === null) {
    return (
      <EntryPage title="Edit entry">
        <p role="alert" className="text-sap-negative">The URL does not name a transaction.</p>
      </EntryPage>
    );
  }
  return <EditEntryForId transactionId={id} />;
}

function EditEntryForId({ transactionId }: { transactionId: number }) {
  const accounts = useAccounts();
  const transaction = useQuery({
    queryKey: ["ledger", "transaction", transactionId],
    queryFn: () => ledgerApi.getTransaction({ params: { id: transactionId } }),
  });

  if (accounts.isPending || transaction.isPending) {
    return <EntryPage title="Edit entry">Loading entry…</EntryPage>;
  }
  if (transaction.isError) {
    const missing = transaction.error instanceof ApiError && transaction.error.status === 404;
    return (
      <EntryPage title="Edit entry">
        <p role="alert" className="text-sap-negative">
          {missing ? "This transaction no longer exists." : "The entry could not be loaded."}
        </p>
        <Link className={cn(buttonVariants({ variant: "outline" }), "mt-3 no-underline")} to={transactionsPath}>
          Back to transactions
        </Link>
      </EntryPage>
    );
  }
  if (accounts.isError) {
    return (
      <EntryPage title="Edit entry">
        <p role="alert" className="text-sap-negative">The chart of accounts could not be loaded.</p>
      </EntryPage>
    );
  }

  const typeById = accountTypes(accounts.byId);
  return (
    <EntryEditor
      key={`entry:${transactionId}`}
      mode="edit"
      transactionId={transactionId}
      initial={draftFromTransaction(transaction.data, typeById)}
      typeById={typeById}
    />
  );
}

function accountTypes(byId: ReadonlyMap<number, { type: AccountType }>) {
  return new Map([...byId].map(([id, account]) => [id, account.type]));
}

/** The tables an entry writes; their grids and caches refresh after a save. */
const ENTRY_TABLES = ["transactions", "postings", "payees"] as const;

async function refreshLedger(queryClient: QueryClient) {
  for (const table of ENTRY_TABLES) reloadTGridRows(table);
  await Promise.all(
    ENTRY_TABLES.map((table) =>
      queryClient.invalidateQueries({ queryKey: tableQueryKeys.table(table) }),
    ),
  );
  await queryClient.invalidateQueries({ queryKey: ["ledger"] });
}

function useEntryForm(
  initial: EntryDraft,
  submit: (body: EntryBody) => Promise<void>,
) {
  return useForm({
    defaultValues: initial,
    listeners: {
      onChange: ({ formApi }) => formApi.setErrorMap({ onSubmit: undefined }),
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const parsed = entryBodyFromDraft(value);
        if (!parsed.ok) throw new FormSubmissionError(parsed.issues);
        await submit(parsed.body);
      } catch (error) {
        formApi.setErrorMap({ onSubmit: submissionErrorMap(error) });
        throw error;
      }
    },
  });
}

type EntryFormApi = ReturnType<typeof useEntryForm>;

type EntryEditorProps = {
  mode: "new" | "edit";
  transactionId?: number;
  initial: EntryDraft;
  typeById: ReadonlyMap<number, AccountType>;
};

function EntryEditor({ mode, transactionId, initial, typeById }: EntryEditorProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const afterSave = useRef<"list" | "another">("list");
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const save = useMutation({
    mutationFn: (body: EntryBody) =>
      mode === "new" || transactionId === undefined
        ? ledgerApi.createEntry({ body })
        : ledgerApi.replaceEntry({ params: { id: transactionId }, body }),
  });
  const remove = useMutation({
    mutationFn: () =>
      ledgerApi.deleteTransaction({ params: { id: transactionId ?? 0 }, body: {} }),
    onSuccess: async () => {
      await refreshLedger(queryClient);
      navigate(transactionsPath, { replace: true });
    },
  });

  const form = useEntryForm(initial, async (body) => {
    await save.mutateAsync(body);
    await refreshLedger(queryClient);
    if (afterSave.current === "another") {
      form.reset(emptyDraft(body.date, body.kind));
      setNotice(`Saved the ${KIND_LABELS[body.kind].toLowerCase()} of ${body.date}. Ready for the next one.`);
      return;
    }
    navigate(transactionsPath);
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    setNotice(null);
    form.setErrorMap({ onSubmit: undefined });
    void form.handleSubmit().catch(() => undefined);
  }

  function switchKind(kind: EntryKind) {
    form.setFieldValue("kind", kind);
    if (form.getFieldValue("splits").length === 0) form.setFieldValue("splits", [emptySplit()]);
    if (form.getFieldValue("lines").length < 2) {
      form.setFieldValue("lines", [emptyLine(), emptyLine()]);
    }
  }

  /**
   * A payee that remembers its account fills in the first empty category
   * line — and, when that account is the other kind of category, switches an
   * untouched expense to income or the reverse.
   */
  async function choosePayee(choice: PayeeChoice) {
    form.setFieldValue("payee", choice);
    if (choice === null || !("id" in choice)) return;
    const payee = await queryClient.fetchQuery(
      tableRecordQueryOptions({
        tableName: "payees",
        recordId: toRecordId(choice.id),
        decodeRow: (row: Row) => payeeRowSchema.parse(row),
      }),
    );
    const defaultId = payee.default_account_id;
    if (defaultId === null) return;
    const defaultType = typeById.get(defaultId);
    if (defaultType === undefined || !isCategoryAccountType(defaultType)) return;
    const kind = form.getFieldValue("kind");
    if (kind !== "expense" && kind !== "income") return;
    const splits = form.getFieldValue("splits");
    const untouched =
      splits.length === 1 && splits[0]?.account_id === null && splits[0].amount.trim() === "";
    if (kind !== defaultType && !untouched) return;
    if (kind !== defaultType) form.setFieldValue("kind", defaultType);
    if (splits.length >= 1 && splits[0]?.account_id === null) {
      form.setFieldValue("splits[0].account_id", defaultId);
    }
  }

  return (
    <EntryPage
      title={mode === "new" ? "New entry" : "Edit entry"}
      actions={
        <Link className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "no-underline")} to={transactionsPath}>
          Cancel
        </Link>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="flex max-w-[52rem] flex-col gap-5">
        <form.Subscribe selector={(state) => state.values.kind}>
          {(kind) => (
            <div role="tablist" aria-label="Kind of entry" className="flex flex-wrap gap-1 border-b border-sap-border-soft pb-3">
              {ENTRY_KINDS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={kind === option}
                  onClick={() => switchKind(option)}
                  className={cn(
                    "h-sap-ctl rounded-[5px] px-3 text-sap-body font-[600] transition-colors",
                    kind === option
                      ? "bg-sap-fg text-sap-bg"
                      : "text-sap-soft hover:bg-sap-row-hover hover:text-sap-fg",
                  )}
                >
                  {KIND_LABELS[option]}
                </button>
              ))}
            </div>
          )}
        </form.Subscribe>

        <div className="grid gap-4 sm:grid-cols-[150px_minmax(0,1fr)]">
          <form.Field name="date">
            {(field) => (
              <FieldBlock label="Date" htmlFor="entry-date" issue={firstFormErrorMessage(field.state.meta.errors)}>
                <Input
                  id="entry-date"
                  type="date"
                  value={field.state.value}
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </FieldBlock>
            )}
          </form.Field>
          <form.Field name="payee">
            {(field) => (
              <FieldBlock label="Payee" htmlFor="entry-payee" issue={firstFormErrorMessage(field.state.meta.errors)}>
                <PayeePicker
                  id="entry-payee"
                  value={field.state.value}
                  onChange={(choice) => void choosePayee(choice)}
                  ariaInvalid={field.state.meta.errors.length > 0}
                />
              </FieldBlock>
            )}
          </form.Field>
        </div>

        <form.Field name="memo">
          {(field) => (
            <FieldBlock label="Memo" htmlFor="entry-memo" issue={firstFormErrorMessage(field.state.meta.errors)}>
              <Input
                id="entry-memo"
                value={field.state.value}
                placeholder="What this was for"
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </FieldBlock>
          )}
        </form.Field>

        <form.Subscribe selector={(state) => state.values.kind}>
          {(kind) => (
            <div className="border-t border-sap-border-soft pt-4">
              {kind === "expense" ? <ExpenseFields form={form} /> : null}
              {kind === "income" ? <IncomeFields form={form} /> : null}
              {kind === "transfer" ? <TransferFields form={form} /> : null}
              {kind === "journal" ? <JournalFields form={form} /> : null}
            </div>
          )}
        </form.Subscribe>

        <form.Subscribe
          selector={(state) => [state.isSubmitting, state.errorMap.onSubmit] as const}
        >
          {([isSubmitting, submitError]) => (
            <div className="flex flex-col gap-3 border-t border-sap-border-soft pt-4">
              {submissionFormMessage(submitError) ? (
                <p role="alert" className="text-sap-body text-sap-negative">
                  {submissionFormMessage(submitError)}
                </p>
              ) : null}
              {notice ? (
                <p role="status" className="text-sap-body text-sap-positive">{notice}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" disabled={isSubmitting} onClick={() => (afterSave.current = "list")}>
                  {isSubmitting ? "Saving…" : mode === "new" ? "Save entry" : "Save changes"}
                </Button>
                {mode === "new" ? (
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={isSubmitting}
                    onClick={() => (afterSave.current = "another")}
                  >
                    Save and add another
                  </Button>
                ) : null}
                {mode === "edit" ? (
                  <span className="ms-auto flex items-center gap-2">
                    {confirmingDelete ? (
                      <>
                        <span className="text-sap-body text-sap-muted">Delete this entry and its postings?</span>
                        <Button type="button" variant="destructive" size="sm" disabled={remove.isPending} onClick={() => remove.mutate()}>
                          {remove.isPending ? "Deleting…" : "Delete"}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
                          Keep
                        </Button>
                      </>
                    ) : (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingDelete(true)}>
                        Delete entry
                      </Button>
                    )}
                  </span>
                ) : null}
              </div>
              {remove.isError ? (
                <p role="alert" className="text-sap-body text-sap-negative">The entry could not be deleted.</p>
              ) : null}
            </div>
          )}
        </form.Subscribe>
      </form>
    </EntryPage>
  );
}

function ExpenseFields({ form }: { form: EntryFormApi }) {
  return (
    <div className="flex flex-col gap-4">
      <form.Field name="from_account_id">
        {(field) => (
          <FieldBlock label="Paid from" htmlFor="entry-from" issue={firstFormErrorMessage(field.state.meta.errors)} className="sm:max-w-[24rem]">
            <AccountPicker
              id="entry-from"
              value={field.state.value}
              onChange={field.handleChange}
              types={BALANCE_ACCOUNT_TYPES}
              placeholder="Checking, card, cash…"
              ariaInvalid={field.state.meta.errors.length > 0}
            />
          </FieldBlock>
        )}
      </form.Field>
      <SplitRows form={form} label="Filed under" types={["expense"]} placeholder="Expense account" />
    </div>
  );
}

function IncomeFields({ form }: { form: EntryFormApi }) {
  return (
    <div className="flex flex-col gap-4">
      <form.Field name="to_account_id">
        {(field) => (
          <FieldBlock label="Deposited to" htmlFor="entry-to" issue={firstFormErrorMessage(field.state.meta.errors)} className="sm:max-w-[24rem]">
            <AccountPicker
              id="entry-to"
              value={field.state.value}
              onChange={field.handleChange}
              types={BALANCE_ACCOUNT_TYPES}
              placeholder="Checking, savings…"
              ariaInvalid={field.state.meta.errors.length > 0}
            />
          </FieldBlock>
        )}
      </form.Field>
      <SplitRows form={form} label="Filed under" types={["income"]} placeholder="Income account" />
    </div>
  );
}

function TransferFields({ form }: { form: EntryFormApi }) {
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_150px]">
      <form.Field name="from_account_id">
        {(field) => (
          <FieldBlock label="From" htmlFor="entry-from" issue={firstFormErrorMessage(field.state.meta.errors)}>
            <AccountPicker id="entry-from" value={field.state.value} onChange={field.handleChange} types={BALANCE_ACCOUNT_TYPES} ariaInvalid={field.state.meta.errors.length > 0} />
          </FieldBlock>
        )}
      </form.Field>
      <form.Field name="to_account_id">
        {(field) => (
          <FieldBlock label="To" htmlFor="entry-to" issue={firstFormErrorMessage(field.state.meta.errors)}>
            <AccountPicker id="entry-to" value={field.state.value} onChange={field.handleChange} types={BALANCE_ACCOUNT_TYPES} ariaInvalid={field.state.meta.errors.length > 0} />
          </FieldBlock>
        )}
      </form.Field>
      <form.Field name="amount">
        {(field) => (
          <FieldBlock label="Amount" htmlFor="entry-amount" issue={firstFormErrorMessage(field.state.meta.errors)}>
            <AmountInput id="entry-amount" value={field.state.value} onChange={field.handleChange} invalid={field.state.meta.errors.length > 0} />
          </FieldBlock>
        )}
      </form.Field>
    </div>
  );
}

function SplitRows({
  form,
  label,
  types,
  placeholder,
}: {
  form: EntryFormApi;
  label: string;
  types: readonly AccountType[];
  placeholder: string;
}) {
  return (
    <form.Field name="splits" mode="array">
      {(splits) => (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sap-label font-bold uppercase tracking-sap-label text-sap-muted">{label}</legend>
          {splits.state.value.map((_, index) => (
            <div key={index} className="grid grid-cols-[minmax(0,1fr)_150px_36px] items-start gap-2">
              <form.Field name={`splits[${index}].account_id`}>
                {(field) => (
                  <FieldBlock htmlFor={`split-${index}-account`} issue={firstFormErrorMessage(field.state.meta.errors)}>
                    <AccountPicker
                      id={`split-${index}-account`}
                      value={field.state.value}
                      onChange={field.handleChange}
                      types={types}
                      placeholder={placeholder}
                      ariaInvalid={field.state.meta.errors.length > 0}
                    />
                  </FieldBlock>
                )}
              </form.Field>
              <form.Field name={`splits[${index}].amount`}>
                {(field) => (
                  <FieldBlock htmlFor={`split-${index}-amount`} issue={firstFormErrorMessage(field.state.meta.errors)}>
                    <AmountInput id={`split-${index}-amount`} value={field.state.value} onChange={field.handleChange} invalid={field.state.meta.errors.length > 0} />
                  </FieldBlock>
                )}
              </form.Field>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove line"
                disabled={splits.state.value.length <= 1}
                onClick={() => splits.removeValue(index)}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
          {firstFormErrorMessage(splits.state.meta.errors) ? (
            <p role="alert" className="text-sap-data text-sap-negative">{firstFormErrorMessage(splits.state.meta.errors)}</p>
          ) : null}
          <div className="flex items-center justify-between gap-3 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => splits.pushValue(emptySplit())}>
              <Plus className="size-4" /> Split across another account
            </Button>
            <form.Subscribe selector={(state) => splitsTotal(state.values.splits)}>
              {(total) => (
                <span className="mono text-sap-data text-sap-soft">
                  Total <strong className="text-sap-fg">{formatMoney(total)}</strong>
                </span>
              )}
            </form.Subscribe>
          </div>
        </fieldset>
      )}
    </form.Field>
  );
}

function JournalFields({ form }: { form: EntryFormApi }) {
  return (
    <form.Field name="lines" mode="array">
      {(lines) => (
        <fieldset className="flex flex-col gap-2">
          <div className="grid grid-cols-[minmax(0,1fr)_130px_130px_36px] gap-2 text-sap-label font-bold uppercase tracking-sap-label text-sap-muted">
            <span>Account</span>
            <span className="text-right">Debit</span>
            <span className="text-right">Credit</span>
            <span />
          </div>
          {lines.state.value.map((_, index) => (
            <div key={index} className="grid grid-cols-[minmax(0,1fr)_130px_130px_36px] items-start gap-2">
              <form.Field name={`lines[${index}].account_id`}>
                {(field) => (
                  <FieldBlock htmlFor={`line-${index}-account`} issue={firstFormErrorMessage(field.state.meta.errors)}>
                    <AccountPicker id={`line-${index}-account`} value={field.state.value} onChange={field.handleChange} ariaInvalid={field.state.meta.errors.length > 0} />
                  </FieldBlock>
                )}
              </form.Field>
              <form.Field name={`lines[${index}].debit`}>
                {(field) => (
                  <FieldBlock htmlFor={`line-${index}-debit`} issue={firstFormErrorMessage(field.state.meta.errors)}>
                    <AmountInput id={`line-${index}-debit`} value={field.state.value} onChange={field.handleChange} invalid={field.state.meta.errors.length > 0} />
                  </FieldBlock>
                )}
              </form.Field>
              <form.Field name={`lines[${index}].credit`}>
                {(field) => (
                  <FieldBlock htmlFor={`line-${index}-credit`} issue={firstFormErrorMessage(field.state.meta.errors)}>
                    <AmountInput id={`line-${index}-credit`} value={field.state.value} onChange={field.handleChange} invalid={field.state.meta.errors.length > 0} />
                  </FieldBlock>
                )}
              </form.Field>
              <Button type="button" variant="ghost" size="icon" aria-label="Remove line" disabled={lines.state.value.length <= 2} onClick={() => lines.removeValue(index)}>
                <X className="size-4" />
              </Button>
            </div>
          ))}
          {firstFormErrorMessage(lines.state.meta.errors) ? (
            <p role="alert" className="text-sap-data text-sap-negative">{firstFormErrorMessage(lines.state.meta.errors)}</p>
          ) : null}
          <div className="flex items-center justify-between gap-3 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => lines.pushValue(emptyLine())}>
              <Plus className="size-4" /> Add line
            </Button>
            <form.Subscribe selector={(state) => journalTotals(state.values.lines)}>
              {(totals) => (
                <span className="mono text-sap-data text-sap-soft">
                  Debits <strong className="text-sap-fg">{formatMoney(totals.debits)}</strong>
                  <span className="mx-2">·</span>
                  Credits <strong className="text-sap-fg">{formatMoney(totals.credits)}</strong>
                  {totals.difference !== 0 ? (
                    <span className="ms-2 text-sap-negative">off by {formatMoney(Math.abs(totals.difference))}</span>
                  ) : (
                    <span className="ms-2 text-sap-positive">balanced</span>
                  )}
                </span>
              )}
            </form.Subscribe>
          </div>
        </fieldset>
      )}
    </form.Field>
  );
}

function AmountInput({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  return (
    <Input
      id={id}
      inputMode="decimal"
      placeholder="0.00"
      value={value}
      aria-invalid={invalid || undefined}
      className="mono text-right"
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function FieldBlock({
  label,
  htmlFor,
  issue,
  className,
  children,
}: {
  label?: string;
  htmlFor: string;
  issue?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      {label ? (
        <Label htmlFor={htmlFor} className="text-sap-label font-bold uppercase tracking-sap-label text-sap-muted">
          {label}
        </Label>
      ) : null}
      {children}
      {issue ? (
        <p role="alert" className="text-sap-data text-sap-negative">{issue}</p>
      ) : null}
    </div>
  );
}

function EntryPage({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <AppPage section="Record" title={title} actions={actions} bodyClassName="p-5 sm:p-6 text-sap-body">
      {children}
    </AppPage>
  );
}

function submissionErrorMap(error: unknown) {
  const issues = fieldIssuesForSubmissionError(error);
  const problem = error instanceof ApiError ? apiProblemFromBody(error.body) : undefined;
  const fields = Object.fromEntries(
    issues
      .filter((issue) => issue.field !== "form")
      .map((issue) => [draftFieldForIssue(issue.field), issue.message]),
  );
  return {
    form:
      issues.find((issue) => issue.field === "form")?.message ??
      (issues.length > 0
        ? "Review the highlighted fields."
        : (problem?.summary ?? "The entry could not be saved.")),
    fields,
  };
}

function submissionFormMessage(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("form" in error)) return undefined;
  return typeof error.form === "string" ? error.form : undefined;
}
