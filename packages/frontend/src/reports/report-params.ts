export type ReportParamError<TParams> = {
  field?: keyof TParams;
  message: string;
};

export function fieldError<TParams>(
  issues: readonly ReportParamError<TParams>[],
  field: keyof TParams,
): string | null {
  return issues.find((issue) => issue.field === field)?.message ?? null;
}
