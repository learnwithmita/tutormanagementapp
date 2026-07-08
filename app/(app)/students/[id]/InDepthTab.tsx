import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/auth";
import { workItemLabel, paperLabel, paperPercent } from "@/lib/progress";
import InDepthSection, { type ItemVM, type TopicOption } from "./InDepthSection";
import type { EnrollmentPapers, WorkItem, PracticePaper } from "@/lib/database.types";

type EnrollmentTab = { id: string; level: string; subject: string };

export default async function InDepthTab({
  studentId,
  activeEnrollments,
  topicFilter,
  highlightId,
}: {
  studentId: string;
  activeEnrollments: EnrollmentTab[];
  topicFilter?: string;
  highlightId?: string;
}) {
  const tutorId = await requireUserId();
  const supabase = await createClient();
  const enrollmentIds = activeEnrollments.map((e) => e.id);

  const [{ data: topics }, { data: workItems }, { data: papers }, { data: paperStats }] =
    await Promise.all([
      supabase
        .from("topics")
        .select("id,level,subject,name,sort_order")
        .eq("tutor_id", tutorId)
        .is("archived_at", null)
        .order("sort_order"),
      enrollmentIds.length
        ? supabase.from("work_items").select("*").in("enrollment_id", enrollmentIds).is("archived_at", null)
        : Promise.resolve({ data: [] as WorkItem[] }),
      enrollmentIds.length
        ? supabase.from("practice_papers").select("*").in("enrollment_id", enrollmentIds).is("archived_at", null)
        : Promise.resolve({ data: [] as PracticePaper[] }),
      enrollmentIds.length
        ? supabase.from("v_enrollment_papers").select("*").in("enrollment_id", enrollmentIds)
        : Promise.resolve({ data: [] as EnrollmentPapers[] }),
    ]);

  const topicName = new Map<string, string>((topics ?? []).map((t: any) => [t.id, t.name]));
  const statByEnrollment = new Map<string, EnrollmentPapers>(
    (paperStats ?? []).map((s: any) => [s.enrollment_id, s]),
  );

  // Attempt numbers for duplicate papers (same school/level/exam_type/year).
  const attemptNo = new Map<string, number>();
  const groups = new Map<string, PracticePaper[]>();
  for (const p of (papers ?? []) as PracticePaper[]) {
    const key = `${p.enrollment_id}|${p.school}|${p.level}|${p.exam_type}|${p.year}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(p);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list
      .sort((a, b) => (a.started_at ?? "9999").localeCompare(b.started_at ?? "9999") || a.created_at.localeCompare(b.created_at))
      .forEach((p, i) => attemptNo.set(p.id, i + 1));
  }

  return (
    <div className="space-y-8">
      {activeEnrollments.length === 0 && (
        <div className="card text-sm text-ink-soft">No active enrolments.</div>
      )}
      {activeEnrollments.map((e) => {
        const syllabusTopics: TopicOption[] = (topics ?? [])
          .filter((t: any) => t.level === e.level && t.subject === e.subject)
          .map((t: any) => ({ id: t.id, name: t.name }));

        const wiVMs: ItemVM[] = ((workItems ?? []) as WorkItem[])
          .filter((w) => w.enrollment_id === e.id)
          .map((w) => ({
            kind: "WORK_ITEM",
            id: w.id,
            type: w.type,
            chip: w.type === "NOTES" ? "N" : "P",
            label: workItemLabel(topicName.get(w.topic_id) ?? "Topic", w.type, w.title),
            topicId: w.topic_id,
            status: w.status,
            startedAt: w.started_at,
            completedAt: w.completed_at,
            scoreText: null,
            score: null,
            maxScore: null,
            attempt: null,
            remark: w.remark,
            paper: null,
            createdAt: w.created_at,
          }));

        const ppVMs: ItemVM[] = ((papers ?? []) as PracticePaper[])
          .filter((p) => p.enrollment_id === e.id)
          .map((p) => {
            const pct = paperPercent(p.score, p.max_score);
            return {
              kind: "PAPER",
              id: p.id,
              type: null,
              chip: "PP",
              label: paperLabel(p.school, p.level, p.exam_type, p.year),
              topicId: null,
              status: p.status,
              startedAt: p.started_at,
              completedAt: p.completed_at,
              scoreText: p.score != null && p.max_score != null ? `${p.score}/${p.max_score} (${pct}%)` : null,
              score: p.score,
              maxScore: p.max_score,
              attempt: attemptNo.get(p.id) ?? null,
              remark: p.remark,
              paper: { school: p.school, level: p.level, examType: p.exam_type, year: p.year },
              createdAt: p.created_at,
            };
          });

        const items = [...wiVMs, ...ppVMs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const stat = statByEnrollment.get(e.id);

        return (
          <section key={e.id}>
            <h2 className="mb-2 text-lg font-semibold">
              {e.level} {e.subject}
            </h2>
            <InDepthSection
              studentId={studentId}
              enrollmentId={e.id}
              enrollmentLevel={e.level}
              topics={syllabusTopics}
              items={items}
              stats={
                stat
                  ? {
                      total: stat.papers_total,
                      completed: stat.papers_completed,
                      avg: stat.avg_pct,
                      best: stat.best_pct,
                      latest: stat.latest_pct,
                    }
                  : null
              }
              initialTopicFilter={topicFilter ?? null}
              highlightId={highlightId ?? null}
            />
          </section>
        );
      })}
    </div>
  );
}
