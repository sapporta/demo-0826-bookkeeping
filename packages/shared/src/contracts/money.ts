// Money is stored as a real number of currency units. Every arithmetic result
// that reaches a comparison or the database goes through `roundMoney`, so
// 0.1 + 0.2 balances against 0.3.

const CENTS = 100;

export function roundMoney(value: number): number {
  // `+ 0` turns a negative zero back into zero, so a balance that reaches
  // nothing reads as 0 rather than -0.
  return Math.round(value * CENTS) / CENTS + 0;
}

export function moneyEquals(a: number, b: number): boolean {
  return roundMoney(a) === roundMoney(b);
}

export function sumMoney(values: readonly number[]): number {
  return roundMoney(values.reduce((total, value) => total + value, 0));
}
