// Who the entry was with. Searches existing payees the way every lookup
// picker does, and offers to add the typed name as a new payee when nothing
// matches it, so a first purchase at a new shop is one step, not two.

import { useMemo, useState } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { useTableLookup } from "@sapporta/frontend/lookup";
import { lookupValueKey, type LookupEntry } from "@sapporta/grid/lookup";
import { useLookupOptions } from "@sapporta/grid/lookup/react";
import type { Row } from "@sapporta/shared/contracts";
import { Combobox, comboboxClassNames } from "@sapporta/ui/combobox";
import { cn } from "@sapporta/ui/cn";
import type { PayeeChoice } from "./entry-draft";

type PayeeItem =
  | { kind: "existing"; entry: LookupEntry<number, Row>; key: string; label: string }
  | { kind: "new"; name: string; key: string; label: string };

const SEARCH_LIMIT = 30;

export type PayeePickerProps = {
  id: string;
  value: PayeeChoice;
  onChange: (value: PayeeChoice) => void;
  disabled?: boolean;
  ariaInvalid?: boolean;
  className?: string;
};

export function PayeePicker({
  id,
  value,
  onChange,
  disabled,
  ariaInvalid,
  className,
}: PayeePickerProps) {
  const lookup = useTableLookup<number>("payees");
  const [searchText, setSearchText] = useState("");
  const selectedValues = useMemo(
    () => (value !== null && "id" in value ? [value.id] : []),
    [value],
  );
  const entries = useLookupOptions({
    valueLookup: lookup.valueLookup,
    searchLookup: lookup.searchLookup,
    selectedValues,
    searchText,
    limit: SEARCH_LIMIT,
  });

  const { items, selected } = useMemo(() => {
    const items: PayeeItem[] = entries.map((entry) => ({
      kind: "existing",
      entry,
      key: `payee:${lookupValueKey(entry.value)}`,
      label: entry.label,
    }));

    let selected: PayeeItem | null = null;
    if (value !== null && "id" in value) {
      selected =
        items.find((item) => item.kind === "existing" && item.entry.value === value.id) ??
        null;
      if (selected === null) {
        // The label is known before the lookup has loaded the entry.
        selected = {
          kind: "existing",
          entry: { value: value.id, label: value.label },
          key: `payee:${lookupValueKey(value.id)}`,
          label: value.label,
        };
        items.push(selected);
      }
    } else if (value !== null) {
      selected = { kind: "new", name: value.name, key: `new:${value.name}`, label: value.name };
      items.push(selected);
    }

    const typed = searchText.trim();
    const exact = entries.some(
      (entry) => entry.label.trim().toLowerCase() === typed.toLowerCase(),
    );
    if (typed !== "" && !exact) {
      items.push({
        kind: "new",
        name: typed,
        key: `new:${typed}`,
        label: `Add “${typed}”`,
      });
    }
    return { items, selected };
  }, [entries, searchText, value]);

  return (
    <Combobox.Root
      items={items}
      value={selected}
      onValueChange={(picked: PayeeItem | null) => {
        setSearchText("");
        if (picked === null) onChange(null);
        else if (picked.kind === "new") onChange({ name: picked.name });
        else onChange({ id: picked.entry.value, label: picked.entry.label });
      }}
      onInputValueChange={(next, { reason }) => {
        setSearchText(reason === "input-change" ? next : "");
      }}
      isItemEqualToValue={(item: PayeeItem, other: PayeeItem) => item.key === other.key}
      itemToStringValue={(item: PayeeItem) =>
        item.kind === "new" ? item.name : item.label
      }
      filter={null}
      disabled={disabled}
    >
      <Combobox.InputGroup className={cn(comboboxClassNames.inputGroup, className)}>
        <Combobox.Input
          id={id}
          aria-invalid={ariaInvalid || undefined}
          placeholder="Payee, or a new name"
          className={comboboxClassNames.input}
        />
        <Combobox.Clear aria-label="Clear payee" className={comboboxClassNames.action}>
          <X aria-hidden />
        </Combobox.Clear>
        <Combobox.Trigger
          aria-label="Open payees"
          className={cn(comboboxClassNames.action, "me-1")}
        >
          <ChevronDown aria-hidden />
        </Combobox.Trigger>
      </Combobox.InputGroup>
      <Combobox.Portal>
        <Combobox.Positioner
          align="start"
          sideOffset={4}
          className={comboboxClassNames.positioner}
        >
          <Combobox.Popup className={comboboxClassNames.popup}>
            <Combobox.Empty className={comboboxClassNames.empty}>
              Type a name to add a payee.
            </Combobox.Empty>
            <Combobox.List className={comboboxClassNames.list}>
              {(item: PayeeItem) => (
                <Combobox.Item
                  key={item.key}
                  value={item}
                  className={comboboxClassNames.item}
                >
                  {item.kind === "new" && item.label !== item.name ? (
                    <span className="flex items-center gap-2 text-sap-soft">
                      <Plus aria-hidden className="size-3.5" />
                      {item.label}
                    </span>
                  ) : (
                    item.label
                  )}
                  <Combobox.ItemIndicator className={comboboxClassNames.itemIndicator}>
                    <Check aria-hidden />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
