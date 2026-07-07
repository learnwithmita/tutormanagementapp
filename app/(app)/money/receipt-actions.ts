"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireTutor } from "@/lib/auth";
import { renderTemplate, type RenderGroup } from "@/lib/render";
import { formatDate } from "@/lib/format";

export type ReceiptResult = {
  ok: boolean;
  error?: string;
  receiptNo?: string;
  messageText?: string;
};

// Issue a receipt for a PAID bill. The sequential number is assigned atomically
// by the DB (issue_receipt); we then render the final text WITH that number and
// store it so "Copy again" reflects the real receipt number.
export async function issueReceipt(billId: string): Promise<ReceiptResult> {
  const tutor = await requireTutor();
  const supabase = await createClient();

  const { data: bill } = await supabase
    .from("bills")
    .select("payer_id,period_label,status, payer:payers(name)")
    .eq("id", billId)
    .maybeSingle();
  if (!bill) return { ok: false, error: "Bill not found." };
  if (bill.status !== "PAID") return { ok: false, error: "Bill is not fully paid." };

  const [{ data: bl }, { data: pays }, { data: appliedAdj }] = await Promise.all([
    supabase
      .from("bill_lessons")
      .select(
        "lesson:lessons(starts_at,duration_min,rate_cents,status, enrollment:enrollments(subject,level,student:students(name)))",
      )
      .eq("bill_id", billId),
    supabase.from("payments").select("paid_at").eq("bill_id", billId).order("paid_at", { ascending: false }).limit(1),
    supabase.from("adjustments").select("reason,amount_cents").eq("related_bill_id", billId),
  ]);

  const payer: any = Array.isArray((bill as any).payer) ? (bill as any).payer[0] : (bill as any).payer;

  // Build render groups from the bill's (non-free) lessons.
  const groupMap = new Map<string, RenderGroup>();
  for (const row of bl ?? []) {
    const l: any = Array.isArray((row as any).lesson) ? (row as any).lesson[0] : (row as any).lesson;
    if (l.status === "CANCELLED_FREE") continue;
    const enr = Array.isArray(l.enrollment) ? l.enrollment[0] : l.enrollment;
    const stu = enr && (Array.isArray(enr.student) ? enr.student[0] : enr.student);
    const key = `${stu?.name}|${enr?.level}|${enr?.subject}`;
    const g: RenderGroup = groupMap.get(key) ?? {
      studentName: stu?.name ?? "—",
      level: enr?.level ?? "",
      subject: enr?.subject ?? "",
      lessons: [],
    };
    g.lessons.push({ startsAt: l.starts_at, durationMin: l.duration_min, rateCents: l.rate_cents });
    groupMap.set(key, g);
  }

  const paidDate = pays && pays.length ? formatDate(pays[0]!.paid_at) : formatDate(new Date().toISOString());

  // Allocate the number + insert the receipt row (with placeholder text).
  const { data: receiptRow, error: rpcErr } = await supabase.rpc("issue_receipt", {
    p_bill_id: billId,
    p_message_text: "",
  });
  if (rpcErr) {
    // Unique violation → already issued.
    return { ok: false, error: "A receipt was already issued for this bill." };
  }
  const receipt: any = Array.isArray(receiptRow) ? receiptRow[0] : receiptRow;
  const receiptNo: string = receipt.receipt_no;

  const finalText = renderTemplate(tutor.receipt_template, {
    payerName: payer?.name ?? "—",
    month: bill.period_label ?? "",
    paynowNumber: tutor.paynow_number ?? "",
    groups: [...groupMap.values()],
    adjustments: (appliedAdj ?? []).map((a) => ({ reason: a.reason, amountCents: a.amount_cents })),
    receiptNo,
    paidDate,
  });

  await supabase.from("receipts").update({ message_text: finalText }).eq("bill_id", billId);

  revalidatePath(`/money/bills/${billId}`);
  return { ok: true, receiptNo, messageText: finalText };
}
