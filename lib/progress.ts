// Progress (Milestone 8) pure logic: status pipelines, date stamping/clearing
// on transitions, labels and status styling. Fully unit-tested (progress.test.ts)
// and shared by the server actions and UI so the rules live in one place.

import type { ProgressStatus, WorkItemType } from "@/lib/database.types";

export type WorkKind = "NOTES" | "PRACTICE" | "PAPER";

// The ordered stages for each kind. NOTES has no DONE/MARKED.
const NOTES_STAGES: ProgressStatus[] = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"];
const FULL_STAGES: ProgressStatus[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "DONE",
  "MARKED",
  "COMPLETED",
];

export function stagesFor(kind: WorkKind): ProgressStatus[] {
  return kind === "NOTES" ? NOTES_STAGES : FULL_STAGES;
}

export function kindOfWorkItem(type: WorkItemType): WorkKind {
  return type === "NOTES" ? "NOTES" : "PRACTICE";
}

export type Stamped = {
  status: ProgressStatus;
  started_at: string | null; // YYYY-MM-DD
  completed_at: string | null;
};

// Apply a status change, auto-stamping/clearing dates. Rules:
//   * started_at applies whenever status !== NOT_STARTED (stamped to `today`
//     only if not already set — existing dates are preserved/editable).
//   * completed_at applies only when status === COMPLETED (stamped to `today`
//     if missing).
//   * Backward moves clear the dates that no longer apply (completed_at when
//     leaving COMPLETED; both when returning to NOT_STARTED).
// A forward jump straight to COMPLETED stamps started=completed=today.
export function applyStatusTransition(
  current: Stamped,
  newStatus: ProgressStatus,
  kind: WorkKind,
  today: string,
): Stamped {
  if (!stagesFor(kind).includes(newStatus)) {
    throw new Error(`${kind} items cannot be ${newStatus}`);
  }

  if (newStatus === "NOT_STARTED") {
    return { status: newStatus, started_at: null, completed_at: null };
  }

  const started_at = current.started_at ?? today;
  const completed_at =
    newStatus === "COMPLETED" ? current.completed_at ?? today : null;

  return { status: newStatus, started_at, completed_at };
}

// ---- Labels ---------------------------------------------------------------

export function workItemLabel(
  topicName: string,
  type: WorkItemType,
  title: string | null,
): string {
  const t = title?.trim();
  if (t) return t;
  return `${topicName} ${type === "NOTES" ? "Notes" : "Practice"}`;
}

export function paperLabel(
  school: string,
  level: string,
  examType: string,
  year: number,
): string {
  return `${school} ${level} ${examType} ${year}`;
}

export function paperPercent(
  score: number | null,
  maxScore: number | null,
): number | null {
  if (score == null || maxScore == null || maxScore <= 0) return null;
  return Math.round((score / maxScore) * 100);
}

// ---- Status styling for chips ---------------------------------------------

export const STATUS_META: Record<
  ProgressStatus,
  { label: string; hint: string; cls: string; short: string }
> = {
  NOT_STARTED: {
    label: "Not started",
    hint: "",
    short: "Not started",
    cls: "border-line bg-gray-50 text-ink-soft",
  },
  IN_PROGRESS: {
    label: "In progress",
    hint: "",
    short: "In progress",
    cls: "border-accent/30 bg-accent-soft text-accent-dark",
  },
  DONE: {
    label: "Done",
    hint: "Waiting for me to mark",
    short: "Done — to mark",
    cls: "border-amber-300 bg-amber-50 text-amber-800",
  },
  MARKED: {
    label: "Marked",
    hint: "Review corrections next lesson",
    short: "Marked — to review",
    cls: "border-purple-300 bg-purple-50 text-purple-800",
  },
  COMPLETED: {
    label: "Completed",
    hint: "",
    short: "Completed",
    cls: "border-emerald-300 bg-emerald-50 text-emerald-800",
  },
};

export const TYPE_CHIP: Record<string, { label: string; cls: string }> = {
  NOTES: { label: "N", cls: "border-sky-300 bg-sky-50 text-sky-700" },
  PRACTICE: { label: "P", cls: "border-indigo-300 bg-indigo-50 text-indigo-700" },
  PAPER: { label: "PP", cls: "border-rose-300 bg-rose-50 text-rose-700" },
};

export const EXAM_TYPE_SUGGESTIONS = [
  "WA1",
  "WA2",
  "WA3",
  "Mid-Year",
  "End-of-Year",
  "Prelim",
  "Other",
];
