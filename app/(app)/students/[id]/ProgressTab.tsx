import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/auth";
import ChecklistSection, { type ChecklistTopic } from "./ChecklistSection";
import type { TopicBadges, EnrollmentChecklist, TopicCheck } from "@/lib/database.types";

type EnrollmentTab = { id: string; level: string; subject: string };

export default async function ProgressTab({
  studentId,
  activeEnrollments,
  pastEnrollments,
}: {
  studentId: string;
  activeEnrollments: EnrollmentTab[];
  pastEnrollments: EnrollmentTab[];
}) {
  const tutorId = await requireUserId();
  const supabase = await createClient();
  const enrollmentIds = activeEnrollments.map((e) => e.id);

  const [{ data: topics }, { data: checklist }, { data: checks }, { data: badges }] =
    await Promise.all([
      supabase
        .from("topics")
        .select("id,level,subject,name,sort_order")
        .eq("tutor_id", tutorId)
        .is("archived_at", null)
        .order("sort_order"),
      enrollmentIds.length
        ? supabase.from("v_enrollment_checklist").select("*").in("enrollment_id", enrollmentIds)
        : Promise.resolve({ data: [] as EnrollmentChecklist[] }),
      enrollmentIds.length
        ? supabase.from("topic_checks").select("enrollment_id,topic_id,checked,checked_at,remark").in("enrollment_id", enrollmentIds)
        : Promise.resolve({ data: [] as Partial<TopicCheck>[] }),
      enrollmentIds.length
        ? supabase.from("v_topic_workitem_badges").select("*").in("enrollment_id", enrollmentIds)
        : Promise.resolve({ data: [] as TopicBadges[] }),
    ]);

  const statByEnrollment = new Map<string, EnrollmentChecklist>(
    (checklist ?? []).map((c: any) => [c.enrollment_id, c]),
  );
  const checkByKey = new Map<string, Partial<TopicCheck>>(
    (checks ?? []).map((c: any) => [`${c.enrollment_id}|${c.topic_id}`, c]),
  );
  const badgeByKey = new Map<string, TopicBadges>(
    (badges ?? []).map((b: any) => [`${b.enrollment_id}|${b.topic_id}`, b]),
  );

  return (
    <div className="space-y-8">
      {activeEnrollments.map((e) => {
        const syllabusTopics = (topics ?? []).filter(
          (t) => t.level === e.level && t.subject === e.subject,
        );
        const stat = statByEnrollment.get(e.id);

        if (syllabusTopics.length === 0) {
          return (
            <section key={e.id}>
              <h2 className="mb-1 text-lg font-semibold">
                {e.level} {e.subject}
              </h2>
              <div className="card text-sm text-ink-soft">
                No syllabus defined for {e.level} {e.subject} yet.{" "}
                <Link
                  href={`/syllabus/${encodeURIComponent(e.level)}/${encodeURIComponent(e.subject)}`}
                  className="font-medium text-accent"
                >
                  Create syllabus
                </Link>
              </div>
            </section>
          );
        }

        const rows: ChecklistTopic[] = syllabusTopics.map((t) => {
          const c = checkByKey.get(`${e.id}|${t.id}`);
          const b = badgeByKey.get(`${e.id}|${t.id}`);
          return {
            topicId: t.id,
            name: t.name,
            checked: c?.checked ?? false,
            checkedAt: c?.checked_at ?? null,
            remark: c?.remark ?? null,
            badges: {
              notesCompleted: b?.notes_completed ?? 0,
              notesInProgress: b?.notes_in_progress ?? 0,
              practiceDone: b?.practice_done ?? 0,
              practiceMarked: b?.practice_marked ?? 0,
              practiceCompleted: b?.practice_completed ?? 0,
              practiceInProgress: b?.practice_in_progress ?? 0,
            },
          };
        });

        return (
          <section key={e.id}>
            <div className="mb-2">
              <h2 className="text-lg font-semibold">
                {e.level} {e.subject}
              </h2>
              <div className="mt-1 flex items-center gap-3">
                <div className="progress max-w-xs">
                  <span style={{ width: `${stat?.pct ?? 0}%` }} />
                </div>
                <span className="text-sm text-ink-soft">
                  {stat?.checked_topics ?? 0} of {stat?.total_topics ?? syllabusTopics.length} topics · {stat?.pct ?? 0}%
                </span>
              </div>
            </div>
            <ChecklistSection studentId={studentId} enrollmentId={e.id} topics={rows} />
          </section>
        );
      })}

      {/* Past (archived) enrollments — read only */}
      {pastEnrollments.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">
            Past
          </h2>
          <div className="space-y-1">
            {pastEnrollments.map((e) => (
              <div key={e.id} className="card text-sm text-ink-soft">
                Past: {e.level} {e.subject} — read only
              </div>
            ))}
          </div>
        </section>
      )}

      {activeEnrollments.length === 0 && pastEnrollments.length === 0 && (
        <div className="card text-sm text-ink-soft">No enrolments yet.</div>
      )}
    </div>
  );
}
