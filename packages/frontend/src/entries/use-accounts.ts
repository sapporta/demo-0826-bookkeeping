// The chart of accounts, loaded once for a screen: the entry form reads
// account types to shape a draft and to check a payee's default account.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { tableRecordsPageQueryOptions } from "@sapporta/frontend/table/query";
import type { Row } from "@sapporta/shared/contracts";
import { accountRowSchema, type AccountRow } from "bookkeeping-shared";

/** A personal chart of accounts is small; this is the most one screen reads. */
const ACCOUNT_ROW_CAP = 500;

const decodeAccount = (row: Row): AccountRow => accountRowSchema.parse(row);

export function useAccounts() {
  const query = useQuery(
    tableRecordsPageQueryOptions({
      tableName: "accounts",
      page: 1,
      limit: ACCOUNT_ROW_CAP,
      decodeRow: decodeAccount,
    }),
  );
  const byId = useMemo(
    () => new Map((query.data?.data ?? []).map((row) => [row.id, row])),
    [query.data],
  );
  return { ...query, accounts: query.data?.data ?? [], byId };
}
