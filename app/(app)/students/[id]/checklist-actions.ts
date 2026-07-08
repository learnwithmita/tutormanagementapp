"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/auth";
import { todaySGT } from "@/lib/format";

export type CheckResult = { ok: boolean; error?: string };

async function upsertCheck(
  studentId: string,
  enrollmentId: string,
  topicId: string,
  patch: Record<string, unknown>,
): Promise<CheckResult> {
  const tutorId = await requireUserId();
  const supabase = await createClient();
  const { error } = await supabase
    .from("topic_checks")
    .upsert(
      { tutor_id: tutorId, enrollment_id: enrollmentId, topic_id: topicId, ...patch },
      { onConflict: "enrollment_id,topic_id" },
    );
  if (error) return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  revalidatePath(`/students/${studentId}`);
  return { ok: true };
}

// Toggle a topic. Checking stamps checked_at (today) if none; unchecking clears it.
export async function toggleTopicCheck(input: {
  studentId: string;
  enrollmentId: string;
  topicId: string;
  checked: boolean;
}): Promise<CheckResult> {
  return upsertCheck(input.studentId, input.enrollmentId, input.topicId, {
    checked: input.checked,
    checked_at: input.checked ? todaySGT() : null,
  });
}

export async function setCheckDate(input: {
  studentId: string;
  enrollmentId: string;
  topicId: string;
  date: string;
}): Promise<CheckResult> {
  return upsertCheck(input.studentId, input.enrollmentId, input.topicId, {
    checked: true,
    checked_at: input.date,
  });
}

// A remark must never imply a check, so on first creation we insert with
// checked = false rather than the column default (true).
export async function setTopicRemark(input: {
  studentId: string;
  enrollmentId: string;
  topicId: string;
  remark: string;
}): Promise<CheckResult> {
  const tutorId = await requireUserId();
  const supabase = await createClient();
  const remark = input.remark.trim() || null;

  const { data: existing } = await supabase
    .from("topic_checks")
    .select("id")
    .eq("enrollment_id", input.enrollmentId)
    .eq("topic_id", input.topicId)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from("topic_checks").update({ remark }).eq("id", existing.id)
    : await supabase.from("topic_checks").insert({
        tutor_id: tutorId,
        enrollment_id: input.enrollmentId,
        topic_id: input.topicId,
        checked: false,
        remark,
      });

  if (error) return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  revalidatePath(`/students/${input.studentId}`);
  return { ok: true };
}
