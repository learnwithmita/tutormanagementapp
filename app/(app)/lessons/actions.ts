"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/auth";
import { formatLessonRange, formatDate } from "@/lib/format";
import { lessonAmountCents } from "@/lib/money";
import type { LessonStatus, PaymentMethod, TeachingMode } from "@/lib/database.types";

function sgtDateOnly(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export type FrozenBill = {
  billId: string;
  label: string;
  status: string;
  totalCents: number;
};

export type LessonResult =
  | { ok: true; id?: string }
  | { ok: false; error?: string; frozen?: FrozenBill; overlap?: string };

function revalidateLessonViews() {
  revalidatePath("/");
  revalidatePath("/calendar");
  revalidatePath("/money");
}

// Returns bill lock info if the lesson is on a SENT/PARTIALLY_PAID/PAID bill.
async function getFrozenBill(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lessonId: string,
): Promise<FrozenBill | null> {
  const { data } = await supabase
    .from("bill_lessons")
    .select("bill_id, bills!inner(id,period_label,status)")
    .eq("lesson_id", lessonId)
    .in("bills.status", ["SENT", "PARTIALLY_PAID", "PAID"])
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const bill: any = Array.isArray((data as any).bills)
    ? (data as any).bills[0]
    : (data as any).bills;
  const { data: totals } = await supabase
    .from("v_bill_totals")
    .select("total_cents")
    .eq("bill_id", bill.id)
    .maybeSingle();
  return {
    billId: bill.id,
    label: bill.period_label ?? "bill",
    status: bill.status,
    totalCents: totals?.total_cents ?? 0,
  };
}

// True if the lesson is on ANY non-void bill (used to block Undo / Delete).
async function onAnyBill(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lessonId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("bill_lessons")
    .select("bill_id, bills!inner(status)")
    .eq("lesson_id", lessonId)
    .neq("bills.status", "VOID")
    .limit(1);
  return (data ?? []).length > 0;
}

async function setStatus(
  lessonId: string,
  status: LessonStatus,
  notes?: string | null,
): Promise<LessonResult> {
  await requireUserId();
  const supabase = await createClient();
  const frozen = await getFrozenBill(supabase, lessonId);
  if (frozen) return { ok: false, frozen };

  const patch: Record<string, unknown> = { status };
  if (notes !== undefined) patch.notes = notes;
  const { error } = await supabase.from("lessons").update(patch).eq("id", lessonId);
  if (error) return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  revalidateLessonViews();
  return { ok: true };
}

export async function completeLesson(lessonId: string, notes: string): Promise<LessonResult> {
  return setStatus(lessonId, "COMPLETED", notes.trim() || null);
}

export async function cancelLesson(lessonId: string, billable: boolean): Promise<LessonResult> {
  return setStatus(lessonId, billable ? "CANCELLED_BILLABLE" : "CANCELLED_FREE");
}

export async function noShowLesson(lessonId: string): Promise<LessonResult> {
  return setStatus(lessonId, "NO_SHOW");
}

export async function undoComplete(lessonId: string): Promise<LessonResult> {
  await requireUserId();
  const supabase = await createClient();
  if (await onAnyBill(supabase, lessonId)) {
    return { ok: false, error: "This lesson is on a bill and can't be reverted." };
  }
  const { error } = await supabase
    .from("lessons")
    .update({ status: "SCHEDULED" })
    .eq("id", lessonId);
  if (error) return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  revalidateLessonViews();
  return { ok: true };
}

export async function rescheduleLesson(
  lessonId: string,
  newStartsAt: string,
): Promise<LessonResult> {
  await requireUserId();
  const supabase = await createClient();
  const frozen = await getFrozenBill(supabase, lessonId);
  if (frozen) return { ok: false, frozen };
  const { error } = await supabase
    .from("lessons")
    .update({ starts_at: newStartsAt })
    .eq("id", lessonId);
  if (error) return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  revalidateLessonViews();
  return { ok: true };
}

export async function deleteLesson(lessonId: string): Promise<LessonResult> {
  await requireUserId();
  const supabase = await createClient();
  if (await onAnyBill(supabase, lessonId)) {
    return {
      ok: false,
      error: "This lesson is on a bill and can't be deleted. Void the bill first.",
    };
  }
  const { error } = await supabase.from("lessons").delete().eq("id", lessonId);
  if (error) return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  revalidateLessonViews();
  return { ok: true };
}

export type EditLessonInput = {
  lessonId: string;
  startsAt: string;
  durationMin: number;
  rateCents: number;
  mode: TeachingMode;
  notes: string | null;
};

export async function updateLesson(input: EditLessonInput): Promise<LessonResult> {
  await requireUserId();
  const supabase = await createClient();
  const frozen = await getFrozenBill(supabase, input.lessonId);
  if (frozen) return { ok: false, frozen };
  if (input.durationMin <= 0 || input.rateCents <= 0) {
    return { ok: false, error: "Duration and rate must be greater than zero." };
  }
  const { error } = await supabase
    .from("lessons")
    .update({
      starts_at: input.startsAt,
      duration_min: input.durationMin,
      rate_cents: input.rateCents,
      mode: input.mode,
      notes: input.notes,
    })
    .eq("id", input.lessonId);
  if (error) return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  revalidateLessonViews();
  return { ok: true };
}

export type CreateLessonInput = {
  enrollmentId: string;
  startsAt: string;
  durationMin: number;
  rateCents: number;
  mode: TeachingMode;
  confirmOverlap?: boolean;
};

export async function createLesson(input: CreateLessonInput): Promise<LessonResult> {
  const tutorId = await requireUserId();
  const supabase = await createClient();

  if (input.durationMin <= 0 || input.rateCents <= 0) {
    return { ok: false, error: "Duration and rate must be greater than zero." };
  }

  const start = new Date(input.startsAt);
  const end = new Date(start.getTime() + input.durationMin * 60_000);

  // Overlap check (non-blocking): look at occupying lessons within a window.
  if (!input.confirmOverlap) {
    const winStart = new Date(start.getTime() - 12 * 3600_000).toISOString();
    const winEnd = new Date(start.getTime() + 12 * 3600_000).toISOString();
    const { data: near } = await supabase
      .from("lessons")
      .select(
        "starts_at,duration_min,status, enrollment:enrollments(student:students(name))",
      )
      .gte("starts_at", winStart)
      .lte("starts_at", winEnd)
      .in("status", ["SCHEDULED", "COMPLETED", "NO_SHOW"]);
    for (const l of near ?? []) {
      const ls = new Date(l.starts_at);
      const le = new Date(ls.getTime() + l.duration_min * 60_000);
      if (ls < end && le > start) {
        const enr: any = Array.isArray((l as any).enrollment)
          ? (l as any).enrollment[0]
          : (l as any).enrollment;
        const stu: any = Array.isArray(enr?.student) ? enr.student[0] : enr?.student;
        return {
          ok: false,
          overlap: `Overlaps with ${stu?.name ?? "another lesson"} at ${formatLessonRange(
            l.starts_at,
            l.duration_min,
          )}. Save anyway?`,
        };
      }
    }
  }

  const { data, error } = await supabase
    .from("lessons")
    .insert({
      tutor_id: tutorId,
      enrollment_id: input.enrollmentId,
      starts_at: input.startsAt,
      duration_min: input.durationMin,
      rate_cents: input.rateCents,
      mode: input.mode,
      status: "SCHEDULED",
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  }
  revalidateLessonViews();
  return { ok: true, id: data.id };
}

// Record a per-lesson payment: creates a one-lesson bill (auto-SENT), links the
// lesson, and records the payment against it so it flows through Money, the
// payer ledger, income totals and receipts — just like any other bill. Used for
// PER_LESSON payers straight after completing a lesson.
export async function recordLessonPayment(
  lessonId: string,
  input: { amountCents: number; paidAt: string; method: PaymentMethod },
): Promise<LessonResult> {
  const tutorId = await requireUserId();
  const supabase = await createClient();

  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    return { ok: false, error: "Enter an amount greater than $0." };
  }

  const { data: lesson } = await supabase
    .from("lessons")
    .select(
      "id,starts_at,duration_min,rate_cents,status, enrollment:enrollments(student:students(payer:payers(id)))",
    )
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson) return { ok: false, error: "Lesson not found." };

  const enr: any = Array.isArray((lesson as any).enrollment)
    ? (lesson as any).enrollment[0]
    : (lesson as any).enrollment;
  const stu: any = enr && (Array.isArray(enr.student) ? enr.student[0] : enr.student);
  const payer: any = stu && (Array.isArray(stu.payer) ? stu.payer[0] : stu.payer);
  if (!payer) return { ok: false, error: "Couldn't find the payer for this lesson." };

  // Don't double-bill: refuse if the lesson is already on a non-void bill.
  const { data: existing } = await supabase
    .from("bill_lessons")
    .select("bill_id, bills!inner(status)")
    .eq("lesson_id", lessonId)
    .neq("bills.status", "VOID")
    .limit(1);
  if (existing && existing.length > 0) {
    return { ok: false, error: "This lesson is already on a bill." };
  }

  const total = lessonAmountCents(lesson.duration_min, lesson.rate_cents);
  const dateOnly = sgtDateOnly(lesson.starts_at);
  const label = `Lesson — ${formatDate(lesson.starts_at)}`;

  const { data: bill, error: billErr } = await supabase
    .from("bills")
    .insert({
      tutor_id: tutorId,
      payer_id: payer.id,
      period_label: label,
      period_start: dateOnly,
      period_end: dateOnly,
      status: "SENT",
      sent_at: new Date().toISOString(),
      message_text: "Per-lesson payment recorded at completion.",
    })
    .select("id")
    .single();
  if (billErr || !bill) {
    return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  }

  const { error: linkErr } = await supabase
    .from("bill_lessons")
    .insert({ tutor_id: tutorId, bill_id: bill.id, lesson_id: lessonId });
  if (linkErr) {
    await supabase.from("bills").delete().eq("id", bill.id);
    return { ok: false, error: "This lesson is already on a bill." };
  }

  await supabase.from("payments").insert({
    tutor_id: tutorId,
    payer_id: payer.id,
    bill_id: bill.id,
    amount_cents: input.amountCents,
    paid_at: input.paidAt,
    method: input.method,
    note: "Paid at lesson",
  });

  await supabase
    .from("bills")
    .update({ status: input.amountCents >= total ? "PAID" : "PARTIALLY_PAID" })
    .eq("id", bill.id);

  revalidateLessonViews();
  return { ok: true };
}
