"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isValidPaynow } from "@/lib/validation";
import type { FormState } from "@/lib/forms";

export async function completeSetup(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const paynow = String(formData.get("paynow_number") ?? "").trim();

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "Name is required";
  if (!paynow) {
    fieldErrors.paynow_number = "PayNow number is required";
  } else if (!isValidPaynow(paynow)) {
    fieldErrors.paynow_number =
      "Enter a valid 8-digit Singapore mobile number";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  // id must equal auth.uid() (enforced by RLS). Templates default in the DB.
  const { error } = await supabase.from("tutors").insert({
    id: user.id,
    name,
    email: user.email ?? null,
    paynow_number: paynow,
  });

  if (error) {
    // Unique violation → a row already exists; treat as done.
    if (error.code === "23505") redirect("/");
    return {
      ok: false,
      error: "Something went wrong — nothing was saved. Try again.",
    };
  }

  redirect("/");
}
