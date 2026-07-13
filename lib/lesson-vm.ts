import type { BillingCycle, LessonStatus, TeachingMode } from "@/lib/database.types";

const SGT = "Asia/Singapore";

// "HH:MM" (24h) of an instant in SGT.
export function sgtTimeHHMM(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SGT,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${m}`;
}

// Day-of-week 0-6 (Sun-Sat) of an instant in SGT.
export function sgtDow(iso: string): number {
  const d = new Intl.DateTimeFormat("en-CA", {
    timeZone: SGT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
  return new Date(`${d}T12:00:00+08:00`).getUTCDay();
}

// Map a lessons row selected with `enrollment:enrollments(subject,level,
// student:students(name,address))` into a LessonVM.
export function toLessonVM(row: any): LessonVM {
  const enr = Array.isArray(row.enrollment) ? row.enrollment[0] : row.enrollment;
  const stu = enr
    ? Array.isArray(enr.student)
      ? enr.student[0]
      : enr.student
    : null;
  const payer = stu
    ? Array.isArray(stu.payer)
      ? stu.payer[0]
      : stu.payer
    : null;

  // Any non-void bill this lesson is on (per-lesson bills are single-lesson).
  let billStatus: string | null = null;
  let billId: string | null = null;
  for (const bl of row.bill_lessons ?? []) {
    const b = Array.isArray(bl.bill) ? bl.bill[0] : bl.bill;
    if (b && b.status !== "VOID") {
      billStatus = b.status;
      billId = b.id;
    }
  }

  return {
    id: row.id,
    startsAt: row.starts_at,
    durationMin: row.duration_min,
    rateCents: row.rate_cents,
    status: row.status,
    mode: row.mode,
    notes: row.notes ?? null,
    studentName: stu?.name ?? "—",
    subjectLevel: enr ? `${enr.level} ${enr.subject}` : "",
    address: stu?.address ?? null,
    recurring: row.recurring_schedule_id != null,
    scheduleId: row.recurring_schedule_id ?? null,
    dayOfWeek: sgtDow(row.starts_at),
    startTimeHHMM: sgtTimeHHMM(row.starts_at),
    payerBillingCycle: payer?.billing_cycle ?? "MONTHLY",
    billed: billStatus != null,
    paid: billStatus === "PAID",
    billStatus,
    billId,
  };
}

export const LESSON_SELECT =
  "id,starts_at,duration_min,rate_cents,status,mode,notes,recurring_schedule_id, enrollment:enrollments(subject,level,student:students(name,address,payer:payers(id,billing_cycle))), bill_lessons(bill:bills(id,status))";

// The view-model every lesson card / drawer / list row uses.
export type LessonVM = {
  id: string;
  startsAt: string;
  durationMin: number;
  rateCents: number;
  status: LessonStatus;
  mode: TeachingMode;
  notes: string | null;
  studentName: string;
  subjectLevel: string;
  address: string | null;
  recurring: boolean;
  scheduleId: string | null;
  dayOfWeek: number; // 0-6 (SGT) of starts_at, for recurring edits
  startTimeHHMM: string; // "HH:MM" (SGT) of starts_at
  payerBillingCycle: BillingCycle;
  billed: boolean; // on a non-void bill
  paid: boolean; // on a fully-paid bill
  billStatus: string | null;
  billId: string | null;
};
