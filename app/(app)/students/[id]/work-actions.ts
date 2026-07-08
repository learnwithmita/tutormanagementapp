"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/auth";
import { todaySGT } from "@/lib/format";
import { applyStatusTransition, kindOfWorkItem } from "@/lib/progress";
import type { ProgressStatus, WorkItemType } from "@/lib/database.types";

export type WorkResult = { ok: boolean; error?: string };

function rev(studentId: string) {
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/"); // marking queue on the home page
  revalidatePath("/marking");
}

function validateScore(score: string, maxScore: string): { ok: boolean; s: number | null; m: number | null; error?: string } {
  const hasS = score.trim() !== "";
  const hasM = maxScore.trim() !== "";
  if (!hasS && !hasM) return { ok: true, s: null, m: null };
  if (hasS !== hasM) return { ok: false, s: null, m: null, error: "Enter both score and max, or leave both blank." };
  const s = Number(score);
  const m = Number(maxScore);
  if (!Number.isFinite(s) || !Number.isFinite(m) || m <= 0 || s < 0 || s > m) {
    return { ok: false, s: null, m: null, error: "Score must be between 0 and max (max > 0)." };
  }
  return { ok: true, s, m };
}

export async function createWorkItem(input: {
  studentId: string;
  enrollmentId: string;
  type: WorkItemType;
  topicId: string;
  title: string;
  status: ProgressStatus;
}): Promise<WorkResult> {
  const tutorId = await requireUserId();
  const supabase = await createClient();
  if (!input.topicId) return { ok: false, error: "Choose a topic" };

  const kind = kindOfWorkItem(input.type);
  let stamped;
  try {
    stamped = applyStatusTransition(
      { status: "NOT_STARTED", started_at: null, completed_at: null },
      input.status,
      kind,
      todaySGT(),
    );
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const { error } = await supabase.from("work_items").insert({
    tutor_id: tutorId,
    enrollment_id: input.enrollmentId,
    type: input.type,
    topic_id: input.topicId,
    title: input.title.trim() || null,
    status: stamped.status,
    started_at: stamped.started_at,
    completed_at: stamped.completed_at,
  });
  if (error) return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  rev(input.studentId);
  return { ok: true };
}

export async function createPaper(input: {
  studentId: string;
  enrollmentId: string;
  school: string;
  level: string;
  examType: string;
  year: number;
  status: ProgressStatus;
  score: string;
  maxScore: string;
}): Promise<WorkResult> {
  const tutorId = await requireUserId();
  const supabase = await createClient();
  if (!input.school.trim()) return { ok: false, error: "School is required" };
  if (!input.level.trim()) return { ok: false, error: "Level is required" };
  if (!input.examType.trim()) return { ok: false, error: "Paper type is required" };
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100)
    return { ok: false, error: "Enter a valid year" };

  const sc = validateScore(input.score, input.maxScore);
  if (!sc.ok) return { ok: false, error: sc.error };

  const stamped = applyStatusTransition(
    { status: "NOT_STARTED", started_at: null, completed_at: null },
    input.status,
    "PAPER",
    todaySGT(),
  );

  const { error } = await supabase.from("practice_papers").insert({
    tutor_id: tutorId,
    enrollment_id: input.enrollmentId,
    school: input.school.trim(),
    level: input.level.trim(),
    exam_type: input.examType.trim(),
    year: input.year,
    status: stamped.status,
    started_at: stamped.started_at,
    completed_at: stamped.completed_at,
    score: sc.s,
    max_score: sc.m,
  });
  if (error) return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  rev(input.studentId);
  return { ok: true };
}

const TABLE = { WORK_ITEM: "work_items", PAPER: "practice_papers" } as const;

export async function changeStatus(input: {
  kind: "WORK_ITEM" | "PAPER";
  id: string;
  studentId: string;
  newStatus: ProgressStatus;
}): Promise<WorkResult> {
  await requireUserId();
  const supabase = await createClient();
  const table = TABLE[input.kind];

  const cols = input.kind === "WORK_ITEM" ? "status,started_at,completed_at,type" : "status,started_at,completed_at";
  const { data: row } = await supabase.from(table).select(cols).eq("id", input.id).maybeSingle();
  if (!row) return { ok: false, error: "Not found." };

  const progressKind =
    input.kind === "PAPER" ? "PAPER" : kindOfWorkItem((row as any).type as WorkItemType);

  let stamped;
  try {
    stamped = applyStatusTransition(
      {
        status: (row as any).status,
        started_at: (row as any).started_at,
        completed_at: (row as any).completed_at,
      },
      input.newStatus,
      progressKind,
      todaySGT(),
    );
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const { error } = await supabase
    .from(table)
    .update({ status: stamped.status, started_at: stamped.started_at, completed_at: stamped.completed_at })
    .eq("id", input.id);
  if (error) return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  rev(input.studentId);
  return { ok: true };
}

export async function setDates(input: {
  kind: "WORK_ITEM" | "PAPER";
  id: string;
  studentId: string;
  startedAt: string;
  completedAt: string;
}): Promise<WorkResult> {
  await requireUserId();
  const supabase = await createClient();
  const started_at = input.startedAt || null;
  const completed_at = input.completedAt || null;
  if (started_at && completed_at && completed_at < started_at) {
    return { ok: false, error: "Completed date can't be before the started date." };
  }
  const { error } = await supabase.from(TABLE[input.kind]).update({ started_at, completed_at }).eq("id", input.id);
  if (error) return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  rev(input.studentId);
  return { ok: true };
}

export async function setPaperScore(input: {
  id: string;
  studentId: string;
  score: string;
  maxScore: string;
}): Promise<WorkResult> {
  await requireUserId();
  const supabase = await createClient();
  const sc = validateScore(input.score, input.maxScore);
  if (!sc.ok) return { ok: false, error: sc.error };
  const { error } = await supabase.from("practice_papers").update({ score: sc.s, max_score: sc.m }).eq("id", input.id);
  if (error) return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  rev(input.studentId);
  return { ok: true };
}

export async function setWorkRemark(input: {
  kind: "WORK_ITEM" | "PAPER";
  id: string;
  studentId: string;
  remark: string;
}): Promise<WorkResult> {
  await requireUserId();
  const supabase = await createClient();
  const { error } = await supabase
    .from(TABLE[input.kind])
    .update({ remark: input.remark.trim() || null })
    .eq("id", input.id);
  if (error) return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  rev(input.studentId);
  return { ok: true };
}

export async function archiveWork(input: {
  kind: "WORK_ITEM" | "PAPER";
  id: string;
  studentId: string;
}): Promise<WorkResult> {
  await requireUserId();
  const supabase = await createClient();
  await supabase.from(TABLE[input.kind]).update({ archived_at: new Date().toISOString() }).eq("id", input.id);
  rev(input.studentId);
  return { ok: true };
}

// Delete only scoreless, never-started items; otherwise archive.
export async function deleteWork(input: {
  kind: "WORK_ITEM" | "PAPER";
  id: string;
  studentId: string;
}): Promise<WorkResult> {
  await requireUserId();
  const supabase = await createClient();
  const table = TABLE[input.kind];
  const cols = input.kind === "PAPER" ? "status,score" : "status";
  const { data: row } = await supabase.from(table).select(cols).eq("id", input.id).maybeSingle();
  if (!row) return { ok: false, error: "Not found." };
  const startedOrScored =
    (row as any).status !== "NOT_STARTED" || (input.kind === "PAPER" && (row as any).score != null);
  if (startedOrScored) return { ok: false, error: "This item has history — archive it instead." };
  await supabase.from(table).delete().eq("id", input.id);
  rev(input.studentId);
  return { ok: true };
}
