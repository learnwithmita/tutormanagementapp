"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/auth";
import { BILLABLE_STATUSES } from "@/lib/billing-util";
import type { StudentSummary } from "@/lib/database.types";

export type RateRange = { rateCents: number; from: string; to: string };
export type PaymentStatus = "PAID" | "PARTIAL" | "UNPAID" | "NONE";

export type StudentSummaryResult = {
  summary: StudentSummary;
  rateRanges: RateRange[];
  paymentStatus: PaymentStatus;
};

const EMPTY: StudentSummary = {
  lesson_count: 0,
  teaching_hours: 0,
  earned_income_cents: 0,
  billed_cents: 0,
  paid_cents: 0,
  outstanding_cents: 0,
  distinct_rates_cents: [],
};

// from/to are YYYY-MM-DD (SGT, inclusive).
export async function getStudentSummary(
  studentId: string,
  from: string,
  to: string,
): Promise<StudentSummaryResult> {
  await requireUserId();
  const supabase = await createClient();

  const { data } = await supabase.rpc("v_student_summary", {
    p_student: studentId,
    p_from: from,
    p_to: to,
  });
  const summary: StudentSummary = (Array.isArray(data) ? data[0] : data) ?? EMPTY;

  // Per-rate date ranges (billable lessons in range).
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("id")
    .eq("student_id", studentId);
  const enrollmentIds = (enrollments ?? []).map((e) => e.id);

  const rateRanges: RateRange[] = [];
  if (enrollmentIds.length) {
    const { data: lessons } = await supabase
      .from("lessons")
      .select("rate_cents,starts_at")
      .in("enrollment_id", enrollmentIds)
      .in("status", BILLABLE_STATUSES)
      .gte("starts_at", `${from}T00:00:00+08:00`)
      .lte("starts_at", `${to}T23:59:59+08:00`)
      .order("starts_at");

    const byRate = new Map<number, { from: string; to: string }>();
    for (const l of lessons ?? []) {
      const d = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Singapore",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(l.starts_at));
      const cur = byRate.get(l.rate_cents);
      if (!cur) byRate.set(l.rate_cents, { from: d, to: d });
      else {
        if (d < cur.from) cur.from = d;
        if (d > cur.to) cur.to = d;
      }
    }
    for (const [rateCents, range] of [...byRate.entries()].sort((a, b) => a[0] - b[0])) {
      rateRanges.push({ rateCents, ...range });
    }
  }

  let paymentStatus: PaymentStatus = "NONE";
  if (summary.billed_cents > 0) {
    paymentStatus =
      summary.paid_cents >= summary.billed_cents
        ? "PAID"
        : summary.paid_cents > 0
          ? "PARTIAL"
          : "UNPAID";
  }

  return { summary, rateRanges, paymentStatus };
}
