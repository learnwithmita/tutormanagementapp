import type { BillingBasis, LessonStatus } from "@/lib/database.types";

export const BILLABLE_STATUSES: LessonStatus[] = [
  "COMPLETED",
  "CANCELLED_BILLABLE",
  "NO_SHOW",
];

// Which lesson statuses are billable candidates for a payer's billing basis.
// SCHEDULED basis bills planned lessons upfront; COMPLETED basis bills arrears.
export function candidateStatuses(basis: BillingBasis): LessonStatus[] {
  return basis === "SCHEDULED"
    ? ["SCHEDULED", ...BILLABLE_STATUSES]
    : [...BILLABLE_STATUSES];
}

// A month string "YYYY-MM" -> SGT range + a human label ("June 2026").
export function monthRange(month: string): {
  startIso: string;
  endIso: string;
  startDate: string;
  endDate: string;
  label: string;
} {
  const [y, m] = month.split("-").map(Number);
  const startDate = `${month}-01`;
  const startIso = `${startDate}T00:00:00+08:00`;
  const nextY = m === 12 ? y! + 1 : y!;
  const nextM = m === 12 ? 1 : m! + 1;
  const nextMonth = `${nextY}-${String(nextM).padStart(2, "0")}`;
  const endIso = `${nextMonth}-01T00:00:00+08:00`;
  // last day of month
  const lastDay = new Date(y!, m!, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;
  const label = new Date(`${startDate}T12:00:00+08:00`).toLocaleDateString("en-SG", {
    timeZone: "Asia/Singapore",
    month: "long",
    year: "numeric",
  });
  return { startIso, endIso, startDate, endDate, label };
}
