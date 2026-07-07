"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/auth";
import { parseDollarsToCents } from "@/lib/money";
import type { FormState } from "@/lib/forms";
import type { TeachingMode } from "@/lib/database.types";

const MODES: TeachingMode[] = ["STUDENT_HOME", "TUTOR_HOME", "ONLINE"];

export async function updateStudent(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireUserId();
  const supabase = await createClient();
  const id = String(formData.get("student_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const mode = String(formData.get("default_mode") ?? "STUDENT_HOME") as TeachingMode;

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "Student name is required";
  if (!MODES.includes(mode)) fieldErrors.default_mode = "Invalid mode";
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  const { error } = await supabase
    .from("students")
    .update({
      name,
      school: String(formData.get("school") ?? "").trim() || null,
      address: String(formData.get("address") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      default_mode: mode,
    })
    .eq("id", id);

  if (error) return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  revalidatePath(`/students/${id}`);
  return { ok: true, message: "Student updated" };
}

export async function setStudentArchived(id: string, archived: boolean) {
  await requireUserId();
  const supabase = await createClient();
  await supabase
    .from("students")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  revalidatePath(`/students/${id}`);
  revalidatePath("/students");
}

export async function saveEnrollment(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireUserId();
  const supabase = await createClient();

  const enrollmentId = String(formData.get("enrollment_id") ?? "").trim();
  const studentId = String(formData.get("student_id") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const level = String(formData.get("level") ?? "").trim();
  const rateCents = parseDollarsToCents(String(formData.get("rate") ?? ""));
  const durationMin = Number(String(formData.get("duration_min") ?? ""));

  const fieldErrors: Record<string, string> = {};
  if (!subject) fieldErrors.subject = "Subject is required";
  if (!level) fieldErrors.level = "Level is required";
  if (rateCents == null || rateCents <= 0)
    fieldErrors.rate = "Enter an hourly rate greater than $0";
  if (!Number.isInteger(durationMin) || durationMin <= 0)
    fieldErrors.duration_min = "Enter a duration in minutes greater than 0";
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  if (enrollmentId) {
    const { error } = await supabase
      .from("enrollments")
      .update({
        subject,
        level,
        default_rate_cents: rateCents!,
        default_duration_min: durationMin,
      })
      .eq("id", enrollmentId);
    if (error) return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  } else {
    const { error } = await supabase.from("enrollments").insert({
      tutor_id: await requireUserId(),
      student_id: studentId,
      subject,
      level,
      default_rate_cents: rateCents!,
      default_duration_min: durationMin,
    });
    if (error) return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  }

  revalidatePath(`/students/${studentId}`);
  return { ok: true, message: enrollmentId ? "Enrolment updated" : "Enrolment added" };
}

// choice: "cancel_free" cancels future SCHEDULED lessons (that aren't on an
// active bill) for free, then archives. "keep" just archives.
export async function archiveEnrollment(
  enrollmentId: string,
  studentId: string,
  choice: "cancel_free" | "keep",
) {
  await requireUserId();
  const supabase = await createClient();

  if (choice === "cancel_free") {
    // Only cancel lessons not already on a non-void bill (those are frozen).
    const { data: billed } = await supabase
      .from("bill_lessons")
      .select("lesson_id, bills!inner(status)")
      .neq("bills.status", "VOID");
    const frozen = new Set((billed ?? []).map((b: any) => b.lesson_id));

    const { data: future } = await supabase
      .from("lessons")
      .select("id")
      .eq("enrollment_id", enrollmentId)
      .eq("status", "SCHEDULED")
      .gte("starts_at", new Date().toISOString());

    const toCancel = (future ?? [])
      .map((l: { id: string }) => l.id)
      .filter((id) => !frozen.has(id));

    if (toCancel.length > 0) {
      await supabase
        .from("lessons")
        .update({ status: "CANCELLED_FREE", notes: "skipped" })
        .in("id", toCancel);
    }
  }

  await supabase
    .from("enrollments")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", enrollmentId);

  revalidatePath(`/students/${studentId}`);
}

export async function unarchiveEnrollment(enrollmentId: string, studentId: string) {
  await requireUserId();
  const supabase = await createClient();
  await supabase.from("enrollments").update({ archived_at: null }).eq("id", enrollmentId);
  revalidatePath(`/students/${studentId}`);
}
