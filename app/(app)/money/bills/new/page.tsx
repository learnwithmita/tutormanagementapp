import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireTutor } from "@/lib/auth";
import { todaySGT } from "@/lib/format";
import { monthRange, candidateStatuses } from "@/lib/billing-util";
import GenerateBillForm, {
  type Candidate,
  type PendingAdjustment,
} from "./GenerateBillForm";

export const dynamic = "force-dynamic";

export default async function GenerateBillPage({
  searchParams,
}: {
  searchParams: { payer?: string; m?: string };
}) {
  const payerId = searchParams.payer;
  if (!payerId) notFound();
  const month = /^\d{4}-\d{2}$/.test(searchParams.m ?? "")
    ? searchParams.m!
    : todaySGT().slice(0, 7);
  const { startIso, endIso, startDate, endDate, label } = monthRange(month);

  const tutor = await requireTutor();
  const supabase = await createClient();

  const { data: payer } = await supabase
    .from("payers")
    .select("id,name,billing_basis")
    .eq("id", payerId)
    .maybeSingle();
  if (!payer) notFound();

  const { data: students } = await supabase
    .from("students")
    .select("id")
    .eq("payer_id", payerId);
  const studentIds = (students ?? []).map((s) => s.id);

  const { data: enrollments } = studentIds.length
    ? await supabase
        .from("enrollments")
        .select("id,subject,level, student:students(name)")
        .in("student_id", studentIds)
    : { data: [] as any[] };
  const enrollmentIds = (enrollments ?? []).map((e: any) => e.id);
  const enrollMap = new Map(
    (enrollments ?? []).map((e: any) => {
      const stu = Array.isArray(e.student) ? e.student[0] : e.student;
      return [e.id, { subject: e.subject, level: e.level, studentName: stu?.name ?? "—" }];
    }),
  );

  const statuses = candidateStatuses(payer.billing_basis);

  const { data: lessons } = enrollmentIds.length
    ? await supabase
        .from("lessons")
        .select("id,starts_at,duration_min,rate_cents,status,enrollment_id")
        .in("enrollment_id", enrollmentIds)
        .in("status", statuses)
        .gte("starts_at", startIso)
        .lt("starts_at", endIso)
        .order("starts_at")
    : { data: [] as any[] };

  // Exclude lessons already on a non-void bill.
  const lessonIds = (lessons ?? []).map((l: any) => l.id);
  const { data: billed } = lessonIds.length
    ? await supabase
        .from("bill_lessons")
        .select("lesson_id, bills!inner(status)")
        .in("lesson_id", lessonIds)
        .neq("bills.status", "VOID")
    : { data: [] as any[] };
  const billedSet = new Set((billed ?? []).map((b: any) => b.lesson_id));

  const candidates: Candidate[] = (lessons ?? [])
    .filter((l: any) => !billedSet.has(l.id))
    .map((l: any) => {
      const e = enrollMap.get(l.enrollment_id)!;
      return {
        id: l.id,
        startsAt: l.starts_at,
        durationMin: l.duration_min,
        rateCents: l.rate_cents,
        status: l.status,
        studentName: e.studentName,
        level: e.level,
        subject: e.subject,
      };
    });

  const { data: adjustments } = await supabase
    .from("adjustments")
    .select("id,reason,amount_cents")
    .eq("payer_id", payerId)
    .is("related_bill_id", null);
  const pendingAdjustments: PendingAdjustment[] = (adjustments ?? []).map((a) => ({
    id: a.id,
    reason: a.reason,
    amountCents: a.amount_cents,
  }));

  return (
    <div>
      <div className="mb-3">
        <Link href="/money" className="text-sm underline">
          ← Money
        </Link>
        <h1 className="text-xl font-semibold">Generate bill — {payer.name}</h1>
        <p className="text-sm text-gray-600">
          Billing basis: <strong>{payer.billing_basis}</strong>
        </p>
      </div>

      {candidates.length === 0 && pendingAdjustments.length === 0 ? (
        <div className="card text-sm text-gray-600">
          No unbilled lessons in this period.
        </div>
      ) : (
        <GenerateBillForm
          payer={{ id: payer.id, name: payer.name }}
          paynowNumber={tutor.paynow_number ?? ""}
          template={tutor.bill_template}
          defaultLabel={label}
          defaultStart={startDate}
          defaultEnd={endDate}
          candidates={candidates}
          adjustments={pendingAdjustments}
        />
      )}
    </div>
  );
}
