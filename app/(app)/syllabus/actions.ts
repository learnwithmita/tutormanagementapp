"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/auth";

export type SyllabusResult = { ok: boolean; error?: string };

function syllabusPath(level: string, subject: string): string {
  return `/syllabus/${encodeURIComponent(level)}/${encodeURIComponent(subject)}`;
}
function revalidateSyllabus(level: string, subject: string) {
  revalidatePath("/syllabus");
  revalidatePath(syllabusPath(level, subject));
}

// Create a syllabus from a level/subject + multi-line topic list. If the
// syllabus already exists, redirect into it instead.
export async function createSyllabus(input: {
  level: string;
  subject: string;
  topicsText: string;
}): Promise<SyllabusResult> {
  const tutorId = await requireUserId();
  const supabase = await createClient();
  const level = input.level.trim();
  const subject = input.subject.trim();
  if (!level || !subject) return { ok: false, error: "Level and subject are required." };

  const { data: existing } = await supabase
    .from("topics")
    .select("id")
    .eq("tutor_id", tutorId)
    .eq("level", level)
    .eq("subject", subject)
    .limit(1);
  if (existing && existing.length > 0) {
    redirect(`${syllabusPath(level, subject)}?exists=1`);
  }

  // Dedupe lines case-insensitively, preserve order.
  const seen = new Set<string>();
  const names: string[] = [];
  let dupes = 0;
  for (const raw of input.topicsText.split("\n")) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) { dupes += 1; continue; }
    seen.add(key);
    names.push(name);
  }

  if (names.length > 0) {
    const rows = names.map((name, i) => ({
      tutor_id: tutorId,
      level,
      subject,
      name,
      sort_order: i,
    }));
    const { error } = await supabase.from("topics").insert(rows);
    if (error) return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  }

  revalidateSyllabus(level, subject);
  redirect(`${syllabusPath(level, subject)}?added=${names.length}&dupes=${dupes}`);
}

export async function addTopic(input: {
  level: string;
  subject: string;
  name: string;
}): Promise<SyllabusResult> {
  const tutorId = await requireUserId();
  const supabase = await createClient();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Topic name is required." };

  const { data: max } = await supabase
    .from("topics")
    .select("sort_order")
    .eq("tutor_id", tutorId)
    .eq("level", input.level)
    .eq("subject", input.subject)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (max?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("topics").insert({
    tutor_id: tutorId,
    level: input.level,
    subject: input.subject,
    name,
    sort_order: nextOrder,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "A topic with that name already exists." };
    return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  }
  revalidateSyllabus(input.level, input.subject);
  return { ok: true };
}

export async function renameTopic(input: {
  topicId: string;
  name: string;
  level: string;
  subject: string;
}): Promise<SyllabusResult> {
  await requireUserId();
  const supabase = await createClient();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Topic name is required." };
  const { error } = await supabase.from("topics").update({ name }).eq("id", input.topicId);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "A topic with that name already exists." };
    return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  }
  revalidateSyllabus(input.level, input.subject);
  return { ok: true };
}

// Swap sort_order with the adjacent non-archived topic.
export async function reorderTopic(input: {
  topicId: string;
  direction: "up" | "down";
  level: string;
  subject: string;
}): Promise<SyllabusResult> {
  const tutorId = await requireUserId();
  const supabase = await createClient();

  const { data: topics } = await supabase
    .from("topics")
    .select("id,sort_order")
    .eq("tutor_id", tutorId)
    .eq("level", input.level)
    .eq("subject", input.subject)
    .is("archived_at", null)
    .order("sort_order");
  const list = topics ?? [];
  const idx = list.findIndex((t) => t.id === input.topicId);
  if (idx < 0) return { ok: false, error: "Topic not found." };
  const swapIdx = input.direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return { ok: true };

  const a = list[idx]!;
  const b = list[swapIdx]!;
  await supabase.from("topics").update({ sort_order: b.sort_order }).eq("id", a.id);
  await supabase.from("topics").update({ sort_order: a.sort_order }).eq("id", b.id);
  revalidateSyllabus(input.level, input.subject);
  return { ok: true };
}

export async function archiveTopic(input: {
  topicId: string;
  level: string;
  subject: string;
}): Promise<SyllabusResult> {
  await requireUserId();
  const supabase = await createClient();
  await supabase
    .from("topics")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", input.topicId);
  revalidateSyllabus(input.level, input.subject);
  return { ok: true };
}

export async function unarchiveTopic(input: {
  topicId: string;
  level: string;
  subject: string;
}): Promise<SyllabusResult> {
  await requireUserId();
  const supabase = await createClient();
  await supabase.from("topics").update({ archived_at: null }).eq("id", input.topicId);
  revalidateSyllabus(input.level, input.subject);
  return { ok: true };
}

// Delete only allowed when the topic has zero checks AND zero work items.
export async function deleteTopic(input: {
  topicId: string;
  level: string;
  subject: string;
}): Promise<SyllabusResult> {
  await requireUserId();
  const supabase = await createClient();

  const [{ count: checks }, { count: work }] = await Promise.all([
    supabase.from("topic_checks").select("id", { count: "exact", head: true }).eq("topic_id", input.topicId),
    supabase.from("work_items").select("id", { count: "exact", head: true }).eq("topic_id", input.topicId),
  ]);
  if ((checks ?? 0) > 0 || (work ?? 0) > 0) {
    return { ok: false, error: "This topic has history — archive it instead." };
  }
  await supabase.from("topics").delete().eq("id", input.topicId);
  revalidateSyllabus(input.level, input.subject);
  return { ok: true };
}

// Copy topic names to another (level, subject). Appends non-clashing names.
export async function duplicateSyllabus(input: {
  fromLevel: string;
  fromSubject: string;
  toLevel: string;
  toSubject: string;
}): Promise<SyllabusResult> {
  const tutorId = await requireUserId();
  const supabase = await createClient();
  const toLevel = input.toLevel.trim();
  const toSubject = input.toSubject.trim();
  if (!toLevel || !toSubject) return { ok: false, error: "Choose a target level and subject." };

  const { data: source } = await supabase
    .from("topics")
    .select("name")
    .eq("tutor_id", tutorId)
    .eq("level", input.fromLevel)
    .eq("subject", input.fromSubject)
    .is("archived_at", null)
    .order("sort_order");

  const { data: target } = await supabase
    .from("topics")
    .select("name,sort_order")
    .eq("tutor_id", tutorId)
    .eq("level", toLevel)
    .eq("subject", toSubject)
    .is("archived_at", null);

  const existing = new Set((target ?? []).map((t) => t.name.toLowerCase()));
  let nextOrder = Math.max(-1, ...(target ?? []).map((t) => t.sort_order)) + 1;

  const rows = (source ?? [])
    .filter((t) => !existing.has(t.name.toLowerCase()))
    .map((t) => ({
      tutor_id: tutorId,
      level: toLevel,
      subject: toSubject,
      name: t.name,
      sort_order: nextOrder++,
    }));

  if (rows.length > 0) {
    const { error } = await supabase.from("topics").insert(rows);
    if (error) return { ok: false, error: "Something went wrong — nothing was saved. Try again." };
  }
  revalidateSyllabus(toLevel, toSubject);
  redirect(`${syllabusPath(toLevel, toSubject)}?copied=${rows.length}`);
}
