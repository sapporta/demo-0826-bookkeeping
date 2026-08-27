// Restoring a demo deployment to its published snapshot. No body: everything
// is settled by the deployment, not the caller. The counts are what a
// scheduler writes to its log.

import { z } from "zod";
import { initContract } from "@sapporta/rest-core";
import { errorBodySchema } from "@sapporta/shared/contracts";
import { isoDateSchema } from "./ledger.js";

const c = initContract();

export const demoResetResultSchema = z.object({
  /** Rows restored, by table name. */
  tables: z.record(z.string(), z.number()),
  /** Their total, so a log line can be read without adding up. */
  rows: z.number(),
  /** How far the dates moved, or null where they were already current. */
  shift: z
    .object({
      /** The snapshot's newest date, moved onto today. */
      anchor: isoDateSchema,
      days: z.number(),
      months: z.number(),
    })
    .nullable(),
  /** How long the restoring transaction held the write lock. */
  duration_ms: z.number(),
});

export type DemoResetResult = z.output<typeof demoResetResultSchema>;

export const demoResetContract = c.router({
  demoReset: c.mutation({
    method: "POST",
    path: "/demo-reset",
    summary: "Restore every table from this deployment's demo snapshot",
    metadata: { tags: ["demo"] },
    body: c.noBody(),
    responses: {
      200: demoResetResultSchema,
      /** Snapshot missing, or no longer matching the schema. */
      503: errorBodySchema,
    },
  }),
});
