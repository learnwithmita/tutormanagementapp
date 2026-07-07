import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  computeBillNumbers,
  type BillRenderContext,
} from "@/lib/render";
import { DEFAULT_BILL_TEMPLATE, DEFAULT_RECEIPT_TEMPLATE } from "@/lib/templates";

// 7 PM SGT lessons.
const L = (day: number, durationMin: number, rateCents: number) => ({
  startsAt: `2026-06-${String(day).padStart(2, "0")}T19:00:00+08:00`,
  durationMin,
  rateCents,
});

const base = (over: Partial<BillRenderContext>): BillRenderContext => ({
  payerName: "Mdm Lim",
  month: "June 2026",
  paynowNumber: "91234567",
  groups: [],
  adjustments: [],
  ...over,
});

describe("uniform bill (one rate, no adjustment)", () => {
  const ctx = base({
    groups: [
      {
        studentName: "Amy",
        level: "Sec 2 G3",
        subject: "Science",
        lessons: [L(3, 60, 5000), L(10, 60, 5000), L(17, 60, 5000)],
      },
    ],
  });

  it("computes totals", () => {
    const n = computeBillNumbers(ctx);
    expect(n.uniform).toBe(true);
    expect(n.totalHours).toBe(3);
    expect(n.rateCents).toBe(5000);
    expect(n.totalCents).toBe(15000);
  });

  it("renders the single total line and flat lesson list", () => {
    const out = renderTemplate(DEFAULT_BILL_TEMPLATE, ctx);
    expect(out).toContain(
      "Hi Mdm Lim the tuition fees are as follows for the month of June 2026 for Sec 2 G3 Science",
    );
    expect(out).toContain("- 3 June 7 PM - 8 PM");
    expect(out).toContain("Total 3 hours x $50 = $150");
    expect(out).toContain("Please paynow the amount to my number 91234567");
    expect(out).not.toContain("{"); // no leftover placeholders
  });
});

describe("mixed bill (different rates + a credit)", () => {
  const ctx = base({
    groups: [
      {
        studentName: "Amy",
        level: "Sec 2 G3",
        subject: "Science",
        lessons: [L(3, 90, 5000), L(10, 90, 5000), L(17, 60, 6000)],
      },
    ],
    adjustments: [{ reason: "17 June lesson cancelled", amountCents: 5000 }],
  });

  it("marks non-uniform and totals net of the credit", () => {
    const n = computeBillNumbers(ctx);
    expect(n.uniform).toBe(false);
    // lessons: 75 + 75 + 60 = 210; credit 50 -> 160
    expect(n.lessonsSubtotalCents).toBe(21000);
    expect(n.totalCents).toBe(16000);
  });

  it("replaces the total line with an itemised block", () => {
    const out = renderTemplate(DEFAULT_BILL_TEMPLATE, ctx);
    expect(out).toContain("2 x 1.5h @ $50 = $150");
    expect(out).toContain("1 x 1h @ $60 = $60");
    expect(out).toContain("Credit (17 June lesson cancelled): -$50");
    expect(out).toContain("Total = $160");
    expect(out).not.toContain("hours x $"); // the uniform line is gone
  });
});

describe("multi-student grouping", () => {
  const ctx = base({
    groups: [
      {
        studentName: "Amy",
        level: "Sec 2 G3",
        subject: "Science",
        lessons: [L(3, 60, 5000)],
      },
      {
        studentName: "Ben",
        level: "Sec 4 G3",
        subject: "Maths",
        lessons: [L(4, 60, 5000)],
      },
    ],
  });

  it("adds per-group headings in the lesson list", () => {
    const out = renderTemplate(DEFAULT_BILL_TEMPLATE, ctx);
    expect(out).toContain("For Amy — Sec 2 G3 Science:");
    expect(out).toContain("For Ben — Sec 4 G3 Maths:");
  });
});

describe("charge adjustment", () => {
  it("renders a + charge line and increases the total", () => {
    const ctx = base({
      groups: [
        {
          studentName: "Amy",
          level: "P5",
          subject: "English",
          lessons: [L(3, 60, 5000)],
        },
      ],
      adjustments: [{ reason: "materials", amountCents: -1000 }],
    });
    const out = renderTemplate(DEFAULT_BILL_TEMPLATE, ctx);
    expect(out).toContain("Charge (materials): +$10");
    expect(out).toContain("Total = $60");
  });
});

describe("receipt template", () => {
  it("fills receipt fields", () => {
    const ctx = base({
      receiptNo: "R-2026-0001",
      paidDate: "5 Jul 2026",
      groups: [
        {
          studentName: "Amy",
          level: "Sec 2 G3",
          subject: "Science",
          lessons: [L(3, 60, 5000)],
        },
      ],
    });
    const out = renderTemplate(DEFAULT_RECEIPT_TEMPLATE, ctx);
    expect(out).toContain("Receipt R-2026-0001");
    expect(out).toContain("Received from Mdm Lim on 5 Jul 2026: $50");
    expect(out).not.toContain("{");
  });
});
