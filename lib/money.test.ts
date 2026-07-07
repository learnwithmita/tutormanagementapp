import { describe, it, expect } from "vitest";
import {
  formatMoney,
  amountDigits,
  parseDollarsToCents,
  lessonAmountCents,
} from "@/lib/money";
import { formatHours } from "@/lib/format";

describe("formatMoney", () => {
  it("hides cents when whole dollars", () => {
    expect(formatMoney(15000)).toBe("$150");
    expect(formatMoney(0)).toBe("$0");
  });
  it("shows two decimals otherwise", () => {
    expect(formatMoney(11250)).toBe("$112.50");
    expect(formatMoney(105)).toBe("$1.05");
  });
  it("handles negatives and thousands", () => {
    expect(formatMoney(-5000)).toBe("-$50");
    expect(formatMoney(120000)).toBe("$1,200");
  });
});

describe("amountDigits", () => {
  it("drops the currency sign", () => {
    expect(amountDigits(5000)).toBe("50");
    expect(amountDigits(11250)).toBe("112.50");
    expect(amountDigits(-5000)).toBe("-50");
  });
});

describe("parseDollarsToCents", () => {
  it("parses valid money", () => {
    expect(parseDollarsToCents("50")).toBe(5000);
    expect(parseDollarsToCents("112.5")).toBe(11250);
    expect(parseDollarsToCents("$1,200.05")).toBe(120005);
  });
  it("rejects invalid", () => {
    expect(parseDollarsToCents("")).toBeNull();
    expect(parseDollarsToCents("abc")).toBeNull();
    expect(parseDollarsToCents("1.234")).toBeNull();
  });
});

describe("lessonAmountCents", () => {
  it("computes duration/60 * rate, rounded", () => {
    expect(lessonAmountCents(60, 5000)).toBe(5000);
    expect(lessonAmountCents(90, 5000)).toBe(7500);
    expect(lessonAmountCents(50, 6000)).toBe(5000); // 6000*50/60 = 5000
    expect(lessonAmountCents(50, 5000)).toBe(4167); // 4166.67 -> 4167
  });
});

describe("formatHours", () => {
  it("whole plain, halves as x.5", () => {
    expect(formatHours(3)).toBe("3");
    expect(formatHours(1.5)).toBe("1.5");
    expect(formatHours(2.25)).toBe("2.25");
  });
});
