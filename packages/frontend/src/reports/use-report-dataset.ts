import { useCallback, useEffect, useRef, useState } from "react";
import type { GridDataset } from "@sapporta/shared/grid-dataset";

export type ReportDatasetLoadContext = {
  signal: AbortSignal;
};

export type UseReportDatasetOptions<TInput> = {
  input: TInput | null;
  load(input: TInput, context: ReportDatasetLoadContext): Promise<GridDataset>;
  enabled?: boolean;
};

export type ReportDatasetSnapshot =
  | {
      status: "idle";
      dataset: null;
      error: null;
      loading: false;
    }
  | {
      status: "loading";
      dataset: GridDataset | null;
      error: null;
      loading: true;
    }
  | {
      status: "success";
      dataset: GridDataset;
      error: null;
      loading: false;
    }
  | {
      status: "error";
      dataset: GridDataset | null;
      error: Error;
      loading: false;
    };

export type ReportDatasetState = ReportDatasetSnapshot & {
  reload(): void;
};

const IDLE_SNAPSHOT = {
  status: "idle",
  dataset: null,
  error: null,
  loading: false,
} satisfies ReportDatasetSnapshot;

export function useReportDataset<TInput>(
  options: UseReportDatasetOptions<TInput>,
): ReportDatasetState {
  const loadRef = useRef(options.load);
  const requestIdRef = useRef(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [snapshot, setSnapshot] =
    useState<ReportDatasetSnapshot>(IDLE_SNAPSHOT);

  loadRef.current = options.load;

  useEffect(() => {
    if (options.input === null || options.enabled === false) {
      requestIdRef.current += 1;
      setSnapshot(IDLE_SNAPSHOT);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const controller = new AbortController();

    setSnapshot((previous) => ({
      status: "loading",
      dataset: previous.dataset,
      error: null,
      loading: true,
    }));

    loadRef
      .current(options.input, { signal: controller.signal })
      .then((dataset) => {
        if (requestIdRef.current !== requestId || controller.signal.aborted) {
          return;
        }
        setSnapshot({
          status: "success",
          dataset,
          error: null,
          loading: false,
        });
      })
      .catch((thrown: unknown) => {
        if (requestIdRef.current !== requestId || controller.signal.aborted) {
          return;
        }
        setSnapshot((previous) => ({
          status: "error",
          dataset: previous.dataset,
          error: normalizeReportError(thrown),
          loading: false,
        }));
      });

    return () => {
      controller.abort();
    };
  }, [options.enabled, options.input, reloadKey]);

  const reload = useCallback(() => {
    setReloadKey((current) => current + 1);
  }, []);

  return {
    ...snapshot,
    reload,
  };
}

function normalizeReportError(thrown: unknown): Error {
  if (thrown instanceof Error) return thrown;
  if (typeof thrown === "string") return new Error(thrown);
  return new Error("Report request failed.");
}
