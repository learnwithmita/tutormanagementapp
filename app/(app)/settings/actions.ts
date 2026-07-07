"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isValidPaynow, findUnknownPlaceholders } from "@/lib/validation";
import type { FormState } from "@/lib/forms";

export async function saveSettings(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Log in again." };

  const name = String(formData.get("name") ?? "").trim();
  const paynow = String(formData.get("paynow_number") ?? "").trim();
  const billTemplate = String(formData.get("bill_template") ?? "");
  const receiptTemplate = String(formData.get("receipt_template") ?? "");
  const confirmUnknown = formData.get("confirm_unknown") === "1";

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

  // Warn (once) about unknown placeholders, but allow saving.
  if (!confirmUnknown) {
    const unknown = [
      ...findUnknownPlaceholders(billTemplate),
      ...findUnknownPlaceholders(receiptTemplate),
    ];
    if (unknown.length > 0) {
      const list = [...new Set(unknown)].join(", ");
      return {
        ok: false,
        warning: `Unknown placeholder ${list} — it will appear literally in messages. Save anyway?`,
      };
    }
  }

  const { error } = await supabase
    .from("tutors")
    .update({
      name,
      paynow_number: paynow,
      bill_template: billTemplate,
      receipt_template: receiptTemplate,
    })
    .eq("id", user.id);

  if (error) {
    return {
      ok: false,
      error: "Something went wrong — nothing was saved. Try again.",
    };
  }

  revalidatePath("/settings");
  return { ok: true, message: "Settings saved" };
}
