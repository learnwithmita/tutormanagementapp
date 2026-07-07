"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/auth";

export type BillResult = { ok: boolean; error?: string; billId?: string };

function revalidateMoney(billId?: string) {
  revalidatePath("/money");
  if (billId) revalidatePath(`/money/bills/${billId}`);
}

export async function createDraftBill(input: {
  payerId: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  lessonIds: string[];
  adjustmentIds: string[];
  messageText: string;
}): Promise<BillResult> {
  const tutorId = await requireUserId();
  const supabase = await createClient();

  if (input.lessonIds.length === 0 && input.adjustmentIds.length === 0) {
    return { ok: false, error: "Select at least one lesson or adjustment to bill." };
  }

  const { data: bill, error } = await supabase
    .from("bills")
    .insert({
      tutor_id: tutorId,
      payer_id: input.payerId,
      period_label: input.periodLabel,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      status: "DRAFT",
      message_text: input.messageText,
    })
    .select("id")
    .single();
  if (error || !bill) {
    return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  }

  if (input.lessonIds.length > 0) {
    const rows = input.lessonIds.map((lid) => ({
      tutor_id: tutorId,
      bill_id: bill.id,
      lesson_id: lid,
    }));
    const { error: blErr } = await supabase.from("bill_lessons").insert(rows);
    if (blErr) {
      // Roll back the draft so we don't leave an empty bill behind.
      await supabase.from("bills").delete().eq("id", bill.id);
      return {
        ok: false,
        error:
          "One of those lessons is already on another bill. Refresh and try again.",
      };
    }
  }

  if (input.adjustmentIds.length > 0) {
    await supabase
      .from("adjustments")
      .update({ related_bill_id: bill.id })
      .in("id", input.adjustmentIds);
  }

  revalidateMoney(bill.id);
  return { ok: true, billId: bill.id };
}

export async function saveDraftMessage(billId: string, messageText: string): Promise<BillResult> {
  await requireUserId();
  const supabase = await createClient();
  const { error } = await supabase
    .from("bills")
    .update({ message_text: messageText })
    .eq("id", billId)
    .eq("status", "DRAFT");
  if (error) return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  revalidateMoney(billId);
  return { ok: true };
}

// Marking sent re-checks the bill is still DRAFT (guards two-tab races).
export async function markBillSent(billId: string, messageText: string): Promise<BillResult> {
  await requireUserId();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bills")
    .update({
      status: "SENT",
      sent_at: new Date().toISOString(),
      message_text: messageText,
    })
    .eq("id", billId)
    .eq("status", "DRAFT")
    .select("id");
  if (error) return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  if (!data || data.length === 0) {
    return { ok: false, error: "This bill is no longer a draft — it may have been sent already." };
  }
  revalidateMoney(billId);
  return { ok: true };
}

export async function deleteDraft(billId: string): Promise<BillResult> {
  await requireUserId();
  const supabase = await createClient();
  // Only drafts can be deleted this way.
  const { data: bill } = await supabase
    .from("bills")
    .select("status")
    .eq("id", billId)
    .maybeSingle();
  if (!bill || bill.status !== "DRAFT") {
    return { ok: false, error: "Only draft bills can be deleted." };
  }
  await supabase.from("adjustments").update({ related_bill_id: null }).eq("related_bill_id", billId);
  await supabase.from("bill_lessons").delete().eq("bill_id", billId);
  await supabase.from("bills").delete().eq("id", billId);
  revalidatePath("/money");
  redirect("/money");
}

// Voiding releases the bill's lessons (they can be billed again) and returns
// its adjustments to pending. Blocked while payments exist.
export async function voidBill(billId: string): Promise<BillResult> {
  await requireUserId();
  const supabase = await createClient();

  const { data: pays } = await supabase
    .from("payments")
    .select("id")
    .eq("bill_id", billId)
    .limit(1);
  if (pays && pays.length > 0) {
    return {
      ok: false,
      error: "Reassign or delete the payments on this bill first.",
    };
  }

  const { error } = await supabase.from("bills").update({ status: "VOID" }).eq("id", billId);
  if (error) return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  await supabase.from("adjustments").update({ related_bill_id: null }).eq("related_bill_id", billId);
  revalidateMoney(billId);
  return { ok: true };
}

// Void & regenerate: void the sent bill, then create a fresh DRAFT with the
// same lessons so the change can be made and re-sent.
export async function voidAndRegenerate(billId: string): Promise<BillResult> {
  const tutorId = await requireUserId();
  const supabase = await createClient();

  const { data: bill } = await supabase
    .from("bills")
    .select("payer_id,period_label,period_start,period_end")
    .eq("id", billId)
    .maybeSingle();
  if (!bill) return { ok: false, error: "Bill not found." };

  const voided = await voidBill(billId);
  if (!voided.ok) return voided;

  const { data: bl } = await supabase
    .from("bill_lessons")
    .select("lesson_id")
    .eq("bill_id", billId);
  const lessonIds = (bl ?? []).map((r: { lesson_id: string }) => r.lesson_id);

  const { data: fresh, error } = await supabase
    .from("bills")
    .insert({
      tutor_id: tutorId,
      payer_id: bill.payer_id,
      period_label: bill.period_label,
      period_start: bill.period_start,
      period_end: bill.period_end,
      status: "DRAFT",
    })
    .select("id")
    .single();
  if (error || !fresh) {
    return { ok: false, error: "Voided the bill, but could not create the new draft." };
  }
  if (lessonIds.length > 0) {
    await supabase.from("bill_lessons").insert(
      lessonIds.map((lid) => ({ tutor_id: tutorId, bill_id: fresh.id, lesson_id: lid })),
    );
  }
  revalidateMoney(billId);
  redirect(`/money/bills/${fresh.id}`);
}

// Pending adjustment (appears on the payer's next bill). amountCents: positive
// = credit to payer, negative = charge.
export async function createAdjustment(input: {
  payerId: string;
  amountCents: number;
  reason: string;
  relatedBillId?: string | null;
}): Promise<BillResult> {
  const tutorId = await requireUserId();
  const supabase = await createClient();
  if (!Number.isInteger(input.amountCents) || input.amountCents === 0) {
    return { ok: false, error: "Enter a non-zero amount." };
  }
  if (!input.reason.trim()) return { ok: false, error: "A reason is required." };

  const { error } = await supabase.from("adjustments").insert({
    tutor_id: tutorId,
    payer_id: input.payerId,
    amount_cents: input.amountCents,
    reason: input.reason.trim(),
    related_bill_id: input.relatedBillId ?? null,
  });
  if (error) return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  revalidatePath("/money");
  revalidatePath(`/money/payers/${input.payerId}`);
  return { ok: true };
}
