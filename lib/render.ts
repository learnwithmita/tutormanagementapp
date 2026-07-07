// Message template rendering — bills and receipts. Pure and fully unit-tested
// (see lib/render.test.ts). See the spec's "Message templates" section.

import { amountDigits, formatMoney, lessonAmountCents } from "@/lib/money";
import { formatHours, formatLessonRange } from "@/lib/format";

export type RenderLesson = {
  startsAt: string;
  durationMin: number;
  rateCents: number;
};
export type RenderGroup = {
  studentName: string;
  level: string;
  subject: string;
  lessons: RenderLesson[];
};
// amountCents: positive = credit to payer, negative = extra charge.
export type RenderAdjustment = { reason: string; amountCents: number };

export type BillRenderContext = {
  payerName: string;
  month: string;
  paynowNumber: string;
  groups: RenderGroup[];
  adjustments: RenderAdjustment[];
  receiptNo?: string;
  paidDate?: string;
};

export type BillNumbers = {
  lessonsSubtotalCents: number;
  adjustmentsCents: number; // sum of amount_cents (credit positive)
  totalCents: number;
  totalHours: number;
  distinctRates: number[];
  uniform: boolean; // one rate AND no adjustment
  rateCents: number | null; // the single rate when uniform
};

function billedLessons(ctx: BillRenderContext): RenderLesson[] {
  return ctx.groups.flatMap((g) => g.lessons);
}

export function computeBillNumbers(ctx: BillRenderContext): BillNumbers {
  const lessons = billedLessons(ctx);
  const lessonsSubtotal = lessons.reduce(
    (sum, l) => sum + lessonAmountCents(l.durationMin, l.rateCents),
    0,
  );
  const adjustmentsCents = ctx.adjustments.reduce((s, a) => s + a.amountCents, 0);
  const totalCents = lessonsSubtotal - adjustmentsCents;
  const totalMinutes = lessons.reduce((s, l) => s + l.durationMin, 0);
  const distinctRates = [...new Set(lessons.map((l) => l.rateCents))].sort(
    (a, b) => a - b,
  );
  const uniform = distinctRates.length <= 1 && ctx.adjustments.length === 0;
  return {
    lessonsSubtotalCents: lessonsSubtotal,
    adjustmentsCents,
    totalCents,
    totalHours: totalMinutes / 60,
    distinctRates,
    uniform,
    rateCents: distinctRates.length === 1 ? distinctRates[0]! : null,
  };
}

function renderLessonList(ctx: BillRenderContext): string {
  const grouped = ctx.groups.length > 1;
  const blocks: string[] = [];
  for (const g of ctx.groups) {
    const lines = g.lessons.map((l) => `- ${formatLessonRange(l.startsAt, l.durationMin)}`);
    if (grouped) {
      blocks.push(`For ${g.studentName} — ${g.level} ${g.subject}:`);
      blocks.push(...lines);
    } else {
      blocks.push(...lines);
    }
  }
  return blocks.join("\n");
}

// The itemised block that replaces the single total line in the mixed case.
function renderItemisedBlock(ctx: BillRenderContext, n: BillNumbers): string {
  const lines: string[] = [];

  // Group billed lessons by (duration, rate).
  const buckets = new Map<string, { durationMin: number; rateCents: number; count: number }>();
  for (const l of billedLessons(ctx)) {
    const key = `${l.durationMin}|${l.rateCents}`;
    const b = buckets.get(key) ?? { durationMin: l.durationMin, rateCents: l.rateCents, count: 0 };
    b.count += 1;
    buckets.set(key, b);
  }
  const ordered = [...buckets.values()].sort(
    (a, b) => a.rateCents - b.rateCents || a.durationMin - b.durationMin,
  );
  for (const b of ordered) {
    const hours = formatHours(b.durationMin / 60);
    const lineTotal = b.count * lessonAmountCents(b.durationMin, b.rateCents);
    lines.push(
      `${b.count} x ${hours}h @ $${amountDigits(b.rateCents)} = $${amountDigits(lineTotal)}`,
    );
  }

  for (const a of ctx.adjustments) {
    if (a.amountCents >= 0) {
      // credit → reduces total
      lines.push(`Credit (${a.reason}): -$${amountDigits(a.amountCents)}`);
    } else {
      // charge → increases total
      lines.push(`Charge (${a.reason}): +$${amountDigits(-a.amountCents)}`);
    }
  }

  lines.push(`Total = $${amountDigits(n.totalCents)}`);
  return lines.join("\n");
}

// Header {student_name}/{level}/{subject}: single group uses its values;
// multiple groups summarise (distinct students; "various" when they differ).
function headerFields(ctx: BillRenderContext) {
  const students = [...new Set(ctx.groups.map((g) => g.studentName))];
  const levels = [...new Set(ctx.groups.map((g) => g.level))];
  const subjects = [...new Set(ctx.groups.map((g) => g.subject))];
  return {
    student_name: students.join(", "),
    level: levels.length === 1 ? levels[0]! : "various",
    subject: subjects.length === 1 ? subjects[0]! : "various",
  };
}

export function renderTemplate(template: string, ctx: BillRenderContext): string {
  const n = computeBillNumbers(ctx);
  const header = headerFields(ctx);
  const lessonList = renderLessonList(ctx);

  const simple: Record<string, string> = {
    payer_name: ctx.payerName,
    month: ctx.month,
    student_name: header.student_name,
    level: header.level,
    subject: header.subject,
    total_hours: formatHours(n.totalHours),
    rate: n.rateCents != null ? amountDigits(n.rateCents) : "",
    total: amountDigits(n.totalCents),
    paynow_number: ctx.paynowNumber,
    receipt_no: ctx.receiptNo ?? "",
    paid_date: ctx.paidDate ?? "",
  };

  // Work line-by-line so we can swap the whole "total" line in the mixed case.
  const lines = template.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const isTotalLine = line.includes("{total_hours}");
    if (isTotalLine && !n.uniform) {
      out.push(renderItemisedBlock(ctx, n));
      continue;
    }
    out.push(line);
  }

  let result = out.join("\n");
  // {lesson_list} may expand to multiple lines — replace after line handling.
  result = result.replace(/\{lesson_list\}/g, lessonList);
  for (const [key, val] of Object.entries(simple)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), val);
  }
  return result;
}

// Convenience for receipts: the amount paid is the bill total.
export function formatReceiptTotal(totalCents: number): string {
  return formatMoney(totalCents);
}
