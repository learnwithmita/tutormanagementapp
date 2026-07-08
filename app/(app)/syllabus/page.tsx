import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NewSyllabusForm from "./NewSyllabusForm";

export const dynamic = "force-dynamic";

function key(level: string, subject: string) {
  return `${level}|||${subject}`;
}

export default async function SyllabusIndexPage() {
  const supabase = await createClient();
  const [{ data: topics }, { data: enrollments }] = await Promise.all([
    supabase.from("topics").select("level,subject,archived_at"),
    supabase.from("enrollments").select("level,subject,archived_at"),
  ]);

  const map = new Map<
    string,
    { level: string; subject: string; topicCount: number; activeEnrollments: number }
  >();
  const touch = (level: string, subject: string) => {
    const k = key(level, subject);
    if (!map.has(k)) map.set(k, { level, subject, topicCount: 0, activeEnrollments: 0 });
    return map.get(k)!;
  };
  for (const t of topics ?? []) {
    const row = touch(t.level, t.subject);
    if (t.archived_at == null) row.topicCount += 1;
  }
  for (const e of enrollments ?? []) {
    const row = touch(e.level, e.subject);
    if (e.archived_at == null) row.activeEnrollments += 1;
  }

  const cards = [...map.values()].sort(
    (a, b) => a.level.localeCompare(b.level) || a.subject.localeCompare(b.subject),
  );

  const levels = [...new Set([...(topics ?? []), ...(enrollments ?? [])].map((r) => r.level))];
  const subjects = [...new Set([...(topics ?? []), ...(enrollments ?? [])].map((r) => r.subject))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Syllabus</h1>
        <p className="mt-0.5 text-sm text-ink-soft">The levels &amp; subjects you teach.</p>
      </div>

      {cards.length === 0 ? (
        <div className="card text-sm text-ink-soft">No syllabi yet — create your first below.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <Link
              key={key(c.level, c.subject)}
              href={`/syllabus/${encodeURIComponent(c.level)}/${encodeURIComponent(c.subject)}`}
              className="card transition hover:shadow-pop"
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                {c.subject}
              </div>
              <div className="text-lg font-semibold">{c.level}</div>
              <div className="mt-2 flex gap-3 text-sm text-ink-soft">
                <span>{c.topicCount} topic{c.topicCount === 1 ? "" : "s"}</span>
                <span>·</span>
                <span>{c.activeEnrollments} student{c.activeEnrollments === 1 ? "" : "s"}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div>
        <h2 className="mb-2 text-lg font-semibold">+ New syllabus</h2>
        <NewSyllabusForm levels={levels} subjects={subjects} />
      </div>
    </div>
  );
}
