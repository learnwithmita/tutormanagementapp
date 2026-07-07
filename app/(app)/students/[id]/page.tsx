import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import {
  formatLessonRange,
  formatHours,
  MODE_LABELS,
  mapsUrl,
} from "@/lib/format";
import StudentHeader from "./StudentHeader";
import EnrollmentsSection, { type EnrollmentRow } from "./EnrollmentsSection";
import RecurringSection, {
  type SlotRow,
  type EnrollmentLite,
} from "./RecurringSection";
import LessonStatusBadge from "@/components/LessonStatusBadge";
import FinancialSummary from "./FinancialSummary";

export const dynamic = "force-dynamic";

export default async function StudentProfile({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { added?: string };
}) {
  const supabase = await createClient();
  const studentId = params.id;

  const { data: student } = await supabase
    .from("students")
    .select("*, payer:payers(id,name)")
    .eq("id", studentId)
    .maybeSingle();

  if (!student) notFound();
  const payer = Array.isArray((student as any).payer)
    ? (student as any).payer[0]
    : (student as any).payer;

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("*")
    .eq("student_id", studentId)
    .order("archived_at", { nullsFirst: true })
    .order("created_at");

  const enrollmentIds = (enrollments ?? []).map((e) => e.id);
  const nameByEnrollment = new Map(
    (enrollments ?? []).map((e) => [e.id, `${e.level} ${e.subject}`]),
  );

  const { data: lessons } = enrollmentIds.length
    ? await supabase
        .from("lessons")
        .select(
          "id,starts_at,duration_min,rate_cents,status,mode,notes,enrollment_id,recurring_schedule_id",
        )
        .in("enrollment_id", enrollmentIds)
        .order("starts_at", { ascending: false })
    : { data: [] as any[] };

  // Active recurring slots for this student's enrollments.
  const { data: slotsData } = enrollmentIds.length
    ? await supabase
        .from("recurring_schedules")
        .select("id,enrollment_id,day_of_week,start_time,duration_min")
        .in("enrollment_id", enrollmentIds)
        .eq("active", true)
    : { data: [] as any[] };

  const nowIso = new Date().toISOString();
  const upcoming = (lessons ?? [])
    .filter((l) => l.status === "SCHEDULED" && l.starts_at >= nowIso)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const history = (lessons ?? []).filter(
    (l) => !(l.status === "SCHEDULED" && l.starts_at >= nowIso),
  );

  // Future SCHEDULED count per enrollment (for the archive dialog).
  const futureCount = new Map<string, number>();
  for (const l of lessons ?? []) {
    if (l.status === "SCHEDULED" && l.starts_at >= nowIso) {
      futureCount.set(l.enrollment_id, (futureCount.get(l.enrollment_id) ?? 0) + 1);
    }
  }

  const enrollmentRows: EnrollmentRow[] = (enrollments ?? []).map((e) => ({
    id: e.id,
    subject: e.subject,
    level: e.level,
    rateCents: e.default_rate_cents,
    durationMin: e.default_duration_min,
    archived: e.archived_at != null,
    futureScheduled: futureCount.get(e.id) ?? 0,
  }));

  // Recurring slots + their future SCHEDULED counts (for the delete dialog).
  const futureBySchedule = new Map<string, number>();
  for (const l of lessons ?? []) {
    if (l.status === "SCHEDULED" && l.starts_at >= nowIso && l.recurring_schedule_id) {
      futureBySchedule.set(
        l.recurring_schedule_id,
        (futureBySchedule.get(l.recurring_schedule_id) ?? 0) + 1,
      );
    }
  }
  const slots: SlotRow[] = (slotsData ?? []).map((s: any) => ({
    id: s.id,
    enrollmentId: s.enrollment_id,
    dayOfWeek: s.day_of_week,
    startTime: s.start_time,
    durationMin: s.duration_min,
    futureCount: futureBySchedule.get(s.id) ?? 0,
  }));
  const activeEnrollmentsLite: EnrollmentLite[] = (enrollments ?? [])
    .filter((e) => e.archived_at == null)
    .map((e) => ({
      id: e.id,
      label: `${e.level} ${e.subject}`,
      defaultDuration: e.default_duration_min,
    }));

  const { data: balances } = await supabase
    .from("v_payer_balances")
    .select("balance_cents")
    .eq("payer_id", student.payer_id)
    .maybeSingle();
  const payerBalance = balances?.balance_cents ?? 0;

  return (
    <div className="space-y-6">
      {searchParams.added && (
        <div className="banner banner-success">Student added.</div>
      )}

      <StudentHeader
        student={{
          id: student.id,
          name: student.name,
          school: student.school,
          address: student.address,
          notes: student.notes,
          mode: student.default_mode,
          archived: student.archived_at != null,
        }}
        payer={{ id: payer?.id, name: payer?.name ?? "—" }}
        payerBalanceCents={payerBalance}
      />

      {/* Enrollments */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Enrolments</h2>
        <EnrollmentsSection studentId={student.id} rows={enrollmentRows} />
      </section>

      {/* Recurring slots */}
      {activeEnrollmentsLite.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Recurring slots</h2>
          <RecurringSection
            studentId={student.id}
            enrollments={activeEnrollmentsLite}
            slots={slots}
          />
        </section>
      )}

      {/* Upcoming lessons */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Upcoming lessons</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-gray-600">No upcoming lessons.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Subject</th>
                <th>Mode</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((l) => (
                <tr key={l.id}>
                  <td>{formatLessonRange(l.starts_at, l.duration_min)}</td>
                  <td>{nameByEnrollment.get(l.enrollment_id)}</td>
                  <td>{MODE_LABELS[l.mode]}</td>
                  <td className="text-right">
                    {formatMoney(Math.round((l.rate_cents * l.duration_min) / 60))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Lesson history */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Lesson history</h2>
        {history.length === 0 ? (
          <p className="text-sm text-gray-600">No past lessons yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Subject</th>
                <th>Status</th>
                <th>Notes</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {history.map((l) => (
                <tr key={l.id}>
                  <td>{formatLessonRange(l.starts_at, l.duration_min)}</td>
                  <td>{nameByEnrollment.get(l.enrollment_id)}</td>
                  <td>
                    <LessonStatusBadge status={l.status} />
                  </td>
                  <td className="max-w-xs truncate text-xs text-gray-600">
                    {l.notes}
                  </td>
                  <td className="text-right">
                    {l.status === "CANCELLED_FREE"
                      ? "—"
                      : formatMoney(
                          Math.round((l.rate_cents * l.duration_min) / 60),
                        )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Financial summary */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Financial summary</h2>
        <FinancialSummary studentId={student.id} />
        <p className="mt-2 text-xs text-gray-500">
          See the{" "}
          <Link href={`/money/payers/${student.payer_id}`} className="underline">
            payer ledger
          </Link>{" "}
          for full billing history.
        </p>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  red,
}: {
  label: string;
  value: string;
  red?: boolean;
}) {
  return (
    <div className="card">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-semibold ${red ? "text-red-700" : ""}`}>
        {value}
      </div>
    </div>
  );
}
