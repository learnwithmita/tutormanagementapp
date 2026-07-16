import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/auth";
import { todaySGT } from "@/lib/format";
import { formatMoney, lessonAmountCents } from "@/lib/money";
import { formatHours } from "@/lib/format";
import { monthRange, candidateStatuses, BILLABLE_STATUSES } from "@/lib/billing-util";
import type { MonthlySummary } from "@/lib/database.types";

export const dynamic = "force-dynamic";

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default async function MoneyPage({
  searchParams,
}: {
  searchParams: { m?: string };
}) {
  const month = /^\d{4}-\d{2}$/.test(searchParams.m ?? "")
    ? searchParams.m!
    : todaySGT().slice(0, 7);
  const { startIso, endIso, label } = monthRange(month);

  const [yy, mm] = month.split("-").map(Number);
  const prevMonth = mm === 1 ? `${yy! - 1}-12` : `${yy}-${String(mm! - 1).padStart(2, "0")}`;
  const nextMonth = mm === 12 ? `${yy! + 1}-01` : `${yy}-${String(mm! + 1).padStart(2, "0")}`;

  const tutorId = await requireUserId();
  const supabase = await createClient();

  const [
    { data: summaryData },
    { data: billsData },
    { data: totalsData },
    { data: lessonRows },
    { data: billedRows },
  ] = await Promise.all([
    supabase.rpc("v_monthly_summary", { p_tutor: tutorId, p_month: `${month}-01` }),
    supabase
      .from("bills")
      .select("id,payer_id,period_label,status,sent_at,created_at, payer:payers(name)")
      .order("created_at", { ascending: false }),
    supabase.from("v_bill_totals").select("bill_id,total_cents,paid_cents,outstanding_cents"),
    supabase
      .from("lessons")
      .select(
        "id,status,duration_min,rate_cents, enrollment:enrollments(student:students(payer:payers(id,name,billing_basis,archived_at)))",
      )
      .gte("starts_at", startIso)
      .lt("starts_at", endIso),
    supabase.from("bill_lessons").select("lesson_id, bills!inner(status)").neq("bills.status", "VOID"),
  ]);

  const summary: MonthlySummary | undefined = Array.isArray(summaryData)
    ? summaryData[0]
    : summaryData;

  const totals = new Map<string, { total: number; paid: number; outstanding: number }>(
    (totalsData ?? []).map((t: any) => [
      t.bill_id,
      { total: t.total_cents, paid: t.paid_cents, outstanding: t.outstanding_cents },
    ]),
  );

  const billedLessonIds = new Set((billedRows ?? []).map((r: any) => r.lesson_id));
  // lesson_id -> status of its (single) non-void bill.
  const billStatusByLesson = new Map<string, string>();
  for (const r of billedRows ?? []) {
    const b: any = Array.isArray((r as any).bills) ? (r as any).bills[0] : (r as any).bills;
    if (b) billStatusByLesson.set((r as any).lesson_id, b.status);
  }

  // Needs billing: count unbilled billable candidates per payer.
  const needByPayer = new Map<string, { name: string; count: number }>();
  for (const l of lessonRows ?? []) {
    const enr: any = Array.isArray((l as any).enrollment) ? (l as any).enrollment[0] : (l as any).enrollment;
    const stu: any = enr && (Array.isArray(enr.student) ? enr.student[0] : enr.student);
    const payer: any = stu && (Array.isArray(stu.payer) ? stu.payer[0] : stu.payer);
    if (!payer || payer.archived_at) continue;
    if (billedLessonIds.has(l.id)) continue;
    if (!candidateStatuses(payer.billing_basis).includes(l.status)) continue;
    const cur = needByPayer.get(payer.id) ?? { name: payer.name, count: 0 };
    cur.count += 1;
    needByPayer.set(payer.id, cur);
  }
  const needsBilling = [...needByPayer.entries()]
    .map(([id, v]) => ({ payerId: id, ...v }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const bills = (billsData ?? []).map((b: any) => {
    const payer = Array.isArray(b.payer) ? b.payer[0] : b.payer;
    const t = totals.get(b.id) ?? { total: 0, paid: 0, outstanding: 0 };
    return {
      id: b.id,
      payerName: payer?.name ?? "—",
      periodLabel: b.period_label ?? "—",
      status: b.status as string,
      sentAt: b.sent_at as string | null,
      total: t.total,
      outstanding: t.outstanding,
    };
  });

  const drafts = bills.filter((b) => b.status === "DRAFT");
  const awaiting = bills
    .filter((b) => b.status === "SENT" || b.status === "PARTIALLY_PAID")
    .sort((a, b) => (a.sentAt ?? "").localeCompare(b.sentAt ?? ""));
  const recent = bills.filter((b) => b.status === "PAID" || b.status === "VOID").slice(0, 20);

  // "You're owed" for the SELECTED MONTH: value of lessons taught this month
  // that you haven't collected yet.
  //   awaiting  = taught lessons on a sent (SENT/PARTIALLY_PAID) bill
  //   notBilled = taught lessons not yet on a sent bill (unbilled or draft)
  // A lesson on a PAID bill is collected and excluded.
  let awaitingCents = 0;
  let notBilledCents = 0;
  for (const l of lessonRows ?? []) {
    if (!BILLABLE_STATUSES.includes(l.status)) continue;
    const amount = lessonAmountCents(l.duration_min, l.rate_cents);
    const billStatus = billStatusByLesson.get(l.id) ?? null;
    if (billStatus === "PAID") continue; // collected
    if (billStatus === "SENT" || billStatus === "PARTIALLY_PAID") awaitingCents += amount;
    else notBilledCents += amount; // unbilled or on a draft
  }
  const owedCents = awaitingCents + notBilledCents;

  return (
    <div className="space-y-6">
      {/* Month selector + you're-owed + summary */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Link href={`/money?m=${prevMonth}`} className="btn">‹</Link>
          <h1 className="min-w-40 text-center text-xl font-semibold">{label}</h1>
          <Link href={`/money?m=${nextMonth}`} className="btn">›</Link>
        </div>

        {/* Uncollected for the selected month */}
        <div className={`card mb-3 ${owedCents > 0 ? "border-red-200 bg-red-50" : ""}`}>
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            You’re owed for {label}
          </div>
          <div
            className={`text-3xl font-semibold tracking-tight ${
              owedCents > 0 ? "text-red-700" : "text-emerald-700"
            }`}
          >
            {formatMoney(owedCents)}
          </div>
          {owedCents > 0 ? (
            <div className="mt-1 text-sm text-ink-soft">
              {formatMoney(awaitingCents)} awaiting payment on sent bills ·{" "}
              {formatMoney(notBilledCents)} for taught lessons not yet billed
            </div>
          ) : (
            <div className="mt-1 text-sm text-ink-soft">
              Everything taught this month is collected 🎉
            </div>
          )}
        </div>

        {summary && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Lessons" value={String(summary.lesson_count)} />
            <Stat label="Hours" value={formatHours(summary.teaching_hours)} />
            <Stat label="Earned" value={formatMoney(summary.earned_income_cents)} />
            <Stat label="Paid" value={formatMoney(summary.paid_cents)} />
          </div>
        )}
      </div>

      {/* Needs billing */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Needs billing</h2>
        {drafts.length > 0 && (
          <div className="mb-2 space-y-1">
            {drafts.map((d) => (
              <div key={d.id} className="card flex items-center justify-between">
                <span>
                  <strong>{d.payerName}</strong> — {d.periodLabel}{" "}
                  <span className="chip ml-1">Draft in progress</span>
                </span>
                <Link href={`/money/bills/${d.id}`} className="btn btn-primary">
                  Resume
                </Link>
              </div>
            ))}
          </div>
        )}
        {needsBilling.length === 0 && drafts.length === 0 ? (
          <div className="card text-sm text-gray-600">Nothing to bill 🎉</div>
        ) : (
          <div className="space-y-1">
            {needsBilling.map((n) => (
              <div key={n.payerId} className="card flex items-center justify-between">
                <span>
                  <strong>{n.name}</strong>{" "}
                  <span className="text-sm text-gray-600">
                    · {n.count} unbilled lesson{n.count === 1 ? "" : "s"}
                  </span>
                </span>
                <Link
                  href={`/money/bills/new?payer=${n.payerId}&m=${month}`}
                  className="btn btn-primary"
                >
                  Generate bill
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Awaiting payment */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Awaiting payment</h2>
        {awaiting.length === 0 ? (
          <div className="card text-sm text-gray-600">Nothing awaiting payment.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Payer</th>
                <th>Period</th>
                <th className="text-right">Outstanding</th>
                <th className="text-right">Days</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {awaiting.map((b) => (
                <tr key={b.id}>
                  <td>{b.payerName}</td>
                  <td>{b.periodLabel}</td>
                  <td className="text-right font-semibold text-red-700">
                    {formatMoney(b.outstanding)}
                  </td>
                  <td className="text-right">{daysSince(b.sentAt)}</td>
                  <td className="text-right">
                    <Link href={`/money/bills/${b.id}`} className="btn">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Recent */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Recent</h2>
        {recent.length === 0 ? (
          <div className="card text-sm text-gray-600">No paid or void bills yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Payer</th>
                <th>Period</th>
                <th>Status</th>
                <th className="text-right">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recent.map((b) => (
                <tr key={b.id}>
                  <td>{b.payerName}</td>
                  <td>{b.periodLabel}</td>
                  <td>{b.status}</td>
                  <td className="text-right">{formatMoney(b.total)}</td>
                  <td className="text-right">
                    <Link href={`/money/bills/${b.id}`} className="btn">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, red }: { label: string; value: string; red?: boolean }) {
  return (
    <div className="card">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-semibold ${red ? "text-red-700" : ""}`}>{value}</div>
    </div>
  );
}
