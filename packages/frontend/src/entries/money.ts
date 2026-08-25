// Money on screen: the same two-decimal figure the report grid renders, and
// the reverse for what a person types into an amount box.

const formatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(value: number): string {
  return formatter.format(value);
}

/** Reads typed amount text; `null` when it is empty or not a number. */
export function parseAmount(text: string): number | null {
  const trimmed = text.replace(/[,\s]/g, "");
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** Amount text for an input, from a stored number. */
export function amountText(value: number): string {
  return value.toFixed(2);
}
