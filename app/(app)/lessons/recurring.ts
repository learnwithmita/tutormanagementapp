"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/auth";
import type { LessonResult } from "./actions";

function revalidateAll(studentId?: string) {
  revalidatePath("/");
  revalidatePath("/calendar");
  if (studentId) revalidatePath(`/students/${studentId}`);
}

// Create a weekly slot and materialise ~8 weeks of lessons immediately.
export async function createRecurringSlot(input: {
  enrollmentId: string;
  studentId: string;
  dayOfWeek: number;
  startTime: string; // "HH:MM"
  durationMin: number;
}): Promise<LessonResult> {
  const tutorId = await requireUserId();
  const supabase = await createClient();
  if (input.durationMin <= 0) return { ok: false, error: "Duration must be greater than zero." };

  const { data: slot, error } = await supabase
    .from("recurring_schedules")
    .insert({
      tutor_id: tutorId,
      enrollment_id: input.enrollmentId,
      day_of_week: input.dayOfWeek,
      start_time: input.startTime,
      duration_min: input.durationMin,
      active: true,
    })
    .select("id")
    .single();
  if (error || !slot) {
    return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  }

  await supabase.rpc("generate_recurring_lessons", { p_schedule_id: slot.id, p_weeks: 8 });
  revalidateAll(input.studentId);
  return { ok: true };
}

// "Skip this week": free-cancel a single generated occurrence.
export async function skipLesson(lessonId: string): Promise<LessonResult> {
  await requireUserId();
  const supabase = await createClient();
  const { error } = await supabase
    .from("lessons")
    .update({ status: "CANCELLED_FREE", notes: "skipped" })
    .eq("id", lessonId);
  if (error) return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  revalidateAll();
  return { ok: true };
}

// "This and all future lessons": edit the schedule, then delete future
// SCHEDULED, non-billed occurrences and regenerate them with the new pattern.
export async function editRecurringFuture(input: {
  scheduleId: string;
  studentId: string;
  dayOfWeek: number;
  startTime: string;
  durationMin: number;
}): Promise<LessonResult> {
  await requireUserId();
  const supabase = await createClient();
  if (input.durationMin <= 0) return { ok: false, error: "Duration must be greater than zero." };

  const { error: uErr } = await supabase
    .from("recurring_schedules")
    .update({
      day_of_week: input.dayOfWeek,
      start_time: input.startTime,
      duration_min: input.durationMin,
    })
    .eq("id", input.scheduleId);
  if (uErr) return { ok: false, error: "Something went wrong — nothing was saved. Try again." };

  await deleteFutureRegenerable(supabase, input.scheduleId);
  await supabase.rpc("generate_recurring_lessons", {
    p_schedule_id: input.scheduleId,
    p_weeks: 8,
  });
  revalidateAll(input.studentId);
  return { ok: true };
}

// Delete a recurring slot: deactivate it, and optionally delete its future
// regenerable occurrences (SCHEDULED, not on any bill). "Keep them" leaves the
// generated lessons as-is (effectively one-off).
export async function deleteRecurringSlot(input: {
  scheduleId: string;
  studentId: string;
  deleteFuture: boolean;
}): Promise<LessonResult> {
  await requireUserId();
  const supabase = await createClient();

  await supabase
    .from("recurring_schedules")
    .update({ active: false })
    .eq("id", input.scheduleId);

  if (input.deleteFuture) {
    await deleteFutureRegenerable(supabase, input.scheduleId);
  }
  revalidateAll(input.studentId);
  return { ok: true };
}

// Count future SCHEDULED, non-billed occurrences for a schedule (for dialogs).
export async function countFutureRegenerable(scheduleId: string): Promise<number> {
  await requireUserId();
  const supabase = await createClient();
  const ids = await futureRegenerableIds(supabase, scheduleId);
  return ids.length;
}

async function futureRegenerableIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scheduleId: string,
): Promise<string[]> {
  const { data: billed } = await supabase
    .from("bill_lessons")
    .select("lesson_id, bills!inner(status)")
    .neq("bills.status", "VOID");
  const frozen = new Set((billed ?? []).map((b: any) => b.lesson_id));

  const { data: future } = await supabase
    .from("lessons")
    .select("id")
    .eq("recurring_schedule_id", scheduleId)
    .eq("status", "SCHEDULED")
    .gte("starts_at", new Date().toISOString());

  return (future ?? [])
    .map((l: { id: string }) => l.id)
    .filter((id) => !frozen.has(id));
}

async function deleteFutureRegenerable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scheduleId: string,
): Promise<void> {
  const ids = await futureRegenerableIds(supabase, scheduleId);
  if (ids.length > 0) {
    await supabase.from("lessons").delete().in("id", ids);
  }
}
