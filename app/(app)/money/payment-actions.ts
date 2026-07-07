"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/auth";
import type { PaymentMethod } from "@/lib/database.types";

export type PaymentResult = {
  ok: boolean;
  error?: string;
  // Present when the amount exceeds the bill's outstanding and the caller has
  // not yet confirmed how to handle the excess.
  excess?: { outstandingCents: number; excessCents: number };
  // Set after deleting a payment on a bill that already had a receipt.
  supersededReceiptNo?: string;
};

const METHODS: PaymentMethod[] = ["PAYNOW", "CASH", "BANK_TRANSFER", "OTHER"];

// Recompute a bill's status from its totals (only for live, non-draft bills).
async function deriveBillStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  billId: string,
) {
  const { data: bill } = await supabase
    .from("bills")
    .select("status")
    .eq("id", billId)
    .maybeSingle();
  if (!bill || bill.status === "DRAFT" || bill.status === "VOID") return;

  const { data: t } = await supabase
    .from("v_bill_totals")
    .select("total_cents,paid_cents")
    .eq("bill_id", billId)
    .maybeSingle();
  const total = t?.total_cents ?? 0;
  const paid = t?.paid_cents ?? 0;
  const next = paid <= 0 ? "SENT" : paid >= total ? "PAID" : "PARTIALLY_PAID";
  if (next !== bill.status) {
    await supabase.from("bills").update({ status: next }).eq("id", billId);
  }
}

export async function recordPayment(input: {
  payerId: string;
  billId: string | null;
  amountCents: number;
  paidAt: string; // YYYY-MM-DD
  method: PaymentMethod;
  note: string;
  confirmExcess?: boolean;
}): Promise<PaymentResult> {
  const tutorId = await requireUserId();
  const supabase = await createClient();

  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    return { ok: false, error: "Enter an amount greater than $0." };
  }
  if (!METHODS.includes(input.method)) return { ok: false, error: "Invalid method." };

  // Excess-over-outstanding handling (bills only).
  if (input.billId) {
    const { data: t } = await supabase
      .from("v_bill_totals")
      .select("outstanding_cents")
      .eq("bill_id", input.billId)
      .maybeSingle();
    const outstanding = t?.outstanding_cents ?? 0;

    if (input.amountCents > outstanding && !input.confirmExcess) {
      return {
        ok: false,
        excess: {
          outstandingCents: outstanding,
          excessCents: input.amountCents - outstanding,
        },
      };
    }

    if (input.amountCents > outstanding && input.confirmExcess) {
      // Settle the bill exactly, book the remainder as a pending credit.
      const excess = input.amountCents - outstanding;
      if (outstanding > 0) {
        await supabase.from("payments").insert({
          tutor_id: tutorId,
          payer_id: input.payerId,
          bill_id: input.billId,
          amount_cents: outstanding,
          paid_at: input.paidAt,
          method: input.method,
          note: input.note || null,
        });
      }
      await supabase.from("adjustments").insert({
        tutor_id: tutorId,
        payer_id: input.payerId,
        amount_cents: excess, // positive = credit to payer
        reason: "Overpayment credit",
        related_bill_id: null,
      });
      await deriveBillStatus(supabase, input.billId);
      revalidatePath(`/money/bills/${input.billId}`);
      revalidatePath(`/money/payers/${input.payerId}`);
      revalidatePath("/money");
      return { ok: true };
    }
  }

  const { error } = await supabase.from("payments").insert({
    tutor_id: tutorId,
    payer_id: input.payerId,
    bill_id: input.billId,
    amount_cents: input.amountCents,
    paid_at: input.paidAt,
    method: input.method,
    note: input.note || null,
  });
  if (error) return { ok: false, error: "Something went wrong — nothing was saved. Try again." };

  if (input.billId) await deriveBillStatus(supabase, input.billId);
  revalidatePath("/money");
  revalidatePath(`/money/payers/${input.payerId}`);
  if (input.billId) revalidatePath(`/money/bills/${input.billId}`);
  return { ok: true };
}

export async function deletePayment(paymentId: string): Promise<PaymentResult> {
  await requireUserId();
  const supabase = await createClient();

  const { data: pay } = await supabase
    .from("payments")
    .select("bill_id,payer_id")
    .eq("id", paymentId)
    .maybeSingle();
  if (!pay) return { ok: false, error: "Payment not found." };

  const { error } = await supabase.from("payments").delete().eq("id", paymentId);
  if (error) return { ok: false, error: "Something went wrong — nothing was saved. Try again." };

  let supersededReceiptNo: string | undefined;
  if (pay.bill_id) {
    const { data: receipt } = await supabase
      .from("receipts")
      .select("receipt_no,status")
      .eq("bill_id", pay.bill_id)
      .maybeSingle();
    if (receipt) {
      await supabase.from("receipts").update({ status: "SUPERSEDED" }).eq("bill_id", pay.bill_id);
      supersededReceiptNo = receipt.receipt_no;
    }
    await deriveBillStatus(supabase, pay.bill_id);
    revalidatePath(`/money/bills/${pay.bill_id}`);
  }
  revalidatePath("/money");
  revalidatePath(`/money/payers/${pay.payer_id}`);
  return { ok: true, supersededReceiptNo };
}
