// A picker over the chart of accounts, narrowed to the kinds of account a
// field accepts: "Paid from" offers only balance accounts, an expense split
// only expense accounts. It is the standard scoped lookup picker with the
// search results filtered by account type, so remote search, selected-label
// loading, keyboard behavior, and styling are the framework's.

import { useMemo } from "react";
import { LookupPicker, useTableLookup } from "@sapporta/frontend/lookup";
import type {
  LookupCapabilities,
  LookupEntry,
  SearchLookup,
} from "@sapporta/grid/lookup";
import type { Row } from "@sapporta/shared/contracts";
import { ACCOUNT_TYPES, type AccountType } from "bookkeeping-shared";

export type AccountPickerProps = {
  id: string;
  value: number | null;
  onChange: (value: number | null) => void;
  /** Account types offered; every type when omitted. */
  types?: readonly AccountType[];
  placeholder?: string;
  disabled?: boolean;
  ariaInvalid?: boolean;
  className?: string;
};

export function AccountPicker({
  id,
  value,
  onChange,
  types = ACCOUNT_TYPES,
  placeholder = "Account",
  disabled,
  ariaInvalid,
  className,
}: AccountPickerProps) {
  const lookup = useAccountLookup(types);
  return (
    <LookupPicker<number, Row>
      id={id}
      lookup={lookup}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      ariaInvalid={ariaInvalid}
      className={className}
      searchLimit={100}
    />
  );
}

function useAccountLookup(
  types: readonly AccountType[],
): LookupCapabilities<number, Row> {
  const base = useTableLookup<number>("accounts");
  const typeKey = types.join(",");
  return useMemo(() => {
    const allowed = new Set<string>(typeKey.split(","));
    return filteredLookup(base, (entry) => {
      const type = entry.meta?.type;
      return typeof type === "string" && allowed.has(type);
    });
  }, [base, typeKey]);
}

/**
 * The same capabilities with search results narrowed by `keep`. Repeated
 * reads of one underlying result array return one filtered array, which is
 * what React's external-store snapshot contract requires.
 */
function filteredLookup(
  base: LookupCapabilities<number, Row>,
  keep: (entry: LookupEntry<number, Row>) => boolean,
): LookupCapabilities<number, Row> {
  const search = base.searchLookup;
  if (search === undefined) return base;

  const filteredBySource = new WeakMap<
    readonly LookupEntry<number, Row>[],
    readonly LookupEntry<number, Row>[]
  >();

  const searchLookup: SearchLookup<number, Row> = {
    subscribeToLookupChanges: (listener) =>
      search.subscribeToLookupChanges(listener),
    cachedSearchResults(request) {
      const source = search.cachedSearchResults(request);
      let filtered = filteredBySource.get(source);
      if (filtered === undefined) {
        filtered = source.filter(keep);
        filteredBySource.set(source, filtered);
      }
      return filtered;
    },
    async loadSearchResults(request) {
      const page = await search.loadSearchResults(request);
      return { ...page, entries: page.entries.filter(keep) };
    },
  };

  return { valueLookup: base.valueLookup, searchLookup };
}
