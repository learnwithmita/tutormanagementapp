"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/auth";
import type { FormState } from "@/lib/forms";
import type { BillingBasis, BillingCycle, TeachingMode } from "@/lib/database.types";

const MODES: TeachingMode[] = ["STUDENT_HOME", "TUTOR_HOME", "ONLINE"];
const CYCLES: BillingCycle[] = ["MONTHLY", "PER_LESSON"];
const BASES: BillingBasis[] = ["SCHEDULED", "COMPLETED"];

export async function createStudent(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tutorId = await requireUserId();
  const supabase = await createClient();

  const payerMode = String(formData.get("payer_mode") ?? "existing");
  const existingPayerId = String(formData.get("payer_id") ?? "").trim();
  const newPayerName = String(formData.get("new_payer_name") ?? "").trim();
  const newPayerPhone = String(formData.get("new_payer_phone") ?? "").trim();
  const cycle = String(formData.get("new_payer_cycle") ?? "MONTHLY") as BillingCycle;
  const basis = String(formData.get("new_payer_basis") ?? "SCHEDULED") as BillingBasis;

  const name = String(formData.get("name") ?? "").trim();
  const school = String(formData.get("school") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const mode = String(formData.get("default_mode") ?? "STUDENT_HOME") as TeachingMode;
  const confirmDup = formData.get("confirm_duplicate") === "1";

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "Student name is required";
  if (payerMode === "existing" && !existingPayerId) {
    fieldErrors.payer_id = "Choose a payer or add a new one";
  }
  if (payerMode === "new" && !newPayerName) {
    fieldErrors.new_payer_name = "Payer name is required";
  }
  if (!MODES.includes(mode)) fieldErrors.default_mode = "Invalid mode";
  if (payerMode === "new" && !CYCLES.includes(cycle))
    fieldErrors.new_payer_cycle = "Invalid billing cycle";
  if (payerMode === "new" && !BASES.includes(basis))
    fieldErrors.new_payer_basis = "Invalid billing basis";

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  // Resolve payer id (create if new).
  let payerId = existingPayerId;
  if (payerMode === "new") {
    const { data: payer, error: pErr } = await supabase
      .from("payers")
      .insert({
        tutor_id: tutorId,
        name: newPayerName,
        phone: newPayerPhone || null,
        billing_cycle: cycle,
        billing_basis: basis,
      })
      .select("id")
      .single();
    if (pErr || !payer) {
      return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
    }
    payerId = payer.id;
  }

  // Non-blocking duplicate warning (only for existing payer; a brand-new payer
  // can't have duplicates).
  if (!confirmDup && payerMode === "existing") {
    const { data: dup } = await supabase
      .from("students")
      .select("id")
      .eq("payer_id", payerId)
      .is("archived_at", null)
      .ilike("name", name)
      .limit(1);
    if (dup && dup.length > 0) {
      return {
        ok: false,
        warning: `A student named ${name} already exists for this payer — continue?`,
      };
    }
  }

  const { data: student, error } = await supabase
    .from("students")
    .insert({
      tutor_id: tutorId,
      payer_id: payerId,
      name,
      school: school || null,
      address: address || null,
      notes: notes || null,
      default_mode: mode,
    })
    .select("id")
    .single();

  if (error || !student) {
    return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  }

  redirect(`/students/${student.id}?added=1`);
}
