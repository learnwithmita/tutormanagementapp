import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/auth";
import SyllabusDetail, { type TopicRow } from "./SyllabusDetail";

export const dynamic = "force-dynamic";

export default async function SyllabusDetailPage({
  params,
  searchParams,
}: {
  params: { level: string; subject: string };
  searchParams: { added?: string; dupes?: string; exists?: string; copied?: string };
}) {
  const level = decodeURIComponent(params.level);
  const subject = decodeURIComponent(params.subject);
  const tutorId = await requireUserId();
  const supabase = await createClient();

  const { data: topics } = await supabase
    .from("topics")
    .select("id,name,sort_order,archived_at")
    .eq("tutor_id", tutorId)
    .eq("level", level)
    .eq("subject", subject)
    .order("archived_at", { nullsFirst: true })
    .order("sort_order");

  const topicIds = (topics ?? []).map((t) => t.id);

  const [{ data: checks }, { data: works }, { data: allTopics }, { data: enrollments }] =
    await Promise.all([
      topicIds.length
        ? supabase.from("topic_checks").select("topic_id").in("topic_id", topicIds)
        : Promise.resolve({ data: [] as { topic_id: string }[] }),
      topicIds.length
        ? supabase.from("work_items").select("topic_id").in("topic_id", topicIds)
        : Promise.resolve({ data: [] as { topic_id: string }[] }),
      supabase.from("topics").select("level,subject"),
      supabase.from("enrollments").select("level,subject"),
    ]);

  const checkCount = new Map<string, number>();
  for (const c of checks ?? []) checkCount.set(c.topic_id, (checkCount.get(c.topic_id) ?? 0) + 1);
  const workCount = new Map<string, number>();
  for (const w of works ?? []) workCount.set(w.topic_id, (workCount.get(w.topic_id) ?? 0) + 1);

  const rows: TopicRow[] = (topics ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    archived: t.archived_at != null,
    checkCount: checkCount.get(t.id) ?? 0,
    workCount: workCount.get(t.id) ?? 0,
  }));

  const levels = [...new Set([...(allTopics ?? []), ...(enrollments ?? [])].map((r) => r.level))];
  const subjects = [...new Set([...(allTopics ?? []), ...(enrollments ?? [])].map((r) => r.subject))];

  const note =
    searchParams.exists === "1"
      ? "This syllabus already exists — add topics here."
      : searchParams.added != null
        ? `Added ${searchParams.added} topic${searchParams.added === "1" ? "" : "s"}` +
          (Number(searchParams.dupes) > 0 ? ` · ${searchParams.dupes} duplicate line(s) ignored` : "")
        : searchParams.copied != null
          ? `Copied ${searchParams.copied} topic${searchParams.copied === "1" ? "" : "s"} here.`
          : null;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/syllabus" className="text-sm underline">← Syllabus</Link>
        <h1 className="text-2xl font-semibold tracking-tight">{level}</h1>
        <p className="text-sm text-ink-soft">{subject}</p>
      </div>
      {note && <div className="banner banner-info">{note}</div>}
      <SyllabusDetail level={level} subject={subject} rows={rows} levels={levels} subjects={subjects} />
    </div>
  );
}
