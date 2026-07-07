import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireTutor } from "@/lib/auth";
import { formatLessonRange } from "@/lib/format";
import BillView, { type BillViewData } from "./BillView";

export const dynamic = "force-dynamic";

export default async function BillPage({ params }: { params: { id: string } }) {
  const billId = params.id;
  const tutor = await requireTutor();
  const supabase = await createClient();

  const { data: bill } = await supabase
    .from("bills")
    .select("id,payer_id,period_label,status,message_text,sent_at, payer:payers(id,name)")
    .eq("id", billId)
    .maybeSingle();
  if (!bill) notFound();
  const payer: any = Array.isArray((bill as any).payer) ? (bill as any).payer[0] : (bill as any).payer;

  const [{ data: totals }, { data: bl }, { data: payments }, { data: adjustments }, { data: receipt }] =
    await Promise.all([
      supabase.from("v_bill_totals").select("*").eq("bill_id", billId).maybeSingle(),
      supabase
        .from("bill_lessons")
        .select(
          "lesson:lessons(id,starts_at,duration_min,rate_cents,status, enrollment:enrollments(subject,level,student:students(name)))",
        )
        .eq("bill_id", billId),
      supabase
        .from("payments")
        .select("id,paid_at,amount_cents,method,note")
        .eq("bill_id", billId)
        .order("paid_at"),
      supabase
        .from("adjustments")
        .select("id,reason,amount_cents")
        .eq("related_bill_id", billId),
      supabase.from("receipts").select("receipt_no,status,message_text").eq("bill_id", billId).maybeSingle(),
    ]);

  const lessons = (bl ?? []).map((row: any) => {
    const l = Array.isArray(row.lesson) ? row.lesson[0] : row.lesson;
    const enr = Array.isArray(l.enrollment) ? l.enrollment[0] : l.enrollment;
    const stu = enr && (Array.isArray(enr.student) ? enr.student[0] : enr.student);
    return {
      id: l.id,
      when: formatLessonRange(l.starts_at, l.duration_min),
      startsAt: l.starts_at,
      durationMin: l.duration_min,
      rateCents: l.rate_cents,
      status: l.status,
      studentName: stu?.name ?? "—",
      level: enr?.level ?? "",
      subject: enr?.subject ?? "",
    };
  });

  const data: BillViewData = {
    id: bill.id,
    payerId: bill.payer_id,
    payerName: payer?.name ?? "—",
    periodLabel: bill.period_label ?? "—",
    status: bill.status,
    messageText: bill.message_text ?? "",
    totalCents: totals?.total_cents ?? 0,
    paidCents: totals?.paid_cents ?? 0,
    outstandingCents: totals?.outstanding_cents ?? 0,
    lessons,
    payments: (payments ?? []).map((p) => ({
      id: p.id,
      paidAt: p.paid_at,
      amountCents: p.amount_cents,
      method: p.method,
      note: p.note,
    })),
    adjustments: (adjustments ?? []).map((a) => ({ reason: a.reason, amountCents: a.amount_cents })),
    receipt: receipt ? { receiptNo: receipt.receipt_no, status: receipt.status, messageText: receipt.message_text } : null,
    paynowNumber: tutor.paynow_number ?? "",
    receiptTemplate: tutor.receipt_template,
  };

  return (
    <div>
      <div className="mb-3">
        <Link href="/money" className="text-sm underline">
          ← Money
        </Link>
      </div>
      <BillView data={data} />
    </div>
  );
}
