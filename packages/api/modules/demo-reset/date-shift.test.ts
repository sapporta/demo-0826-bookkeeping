import { describe, expect, it } from "vitest";
import { Temporal } from "@sapporta/shared/temporal";
import { planDateShift, type DateShiftRequest } from "./date-shift.js";

const on = (today: string): DateShiftRequest => ({
  today: Temporal.PlainDate.from(today),
  columns: [{ table: "entries", column: "date", unit: "day" }],
});

describe("planDateShift", () => {
  it("measures the same distance in days and in calendar months", () => {
    expect(planDateShift(on("2026-11-15"), "2026-08-25")).toMatchObject({
      days: 82,
      months: 3,
    });
  });

  it("counts months by the calendar, not from the days between", () => {
    // Four days apart, but across a month boundary: day columns move four
    // days and month columns move a whole month, which is what keeps a
    // budget landing on a month.
    expect(planDateShift(on("2026-09-02"), "2026-08-29")).toMatchObject({
      days: 4,
      months: 1,
    });
  });

  it("refuses to walk the books backwards", () => {
    expect(planDateShift(on("2026-08-01"), "2026-08-25")).toBeNull();
  });
});
