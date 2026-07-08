import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { STATUS_META } from "@/lib/progress";
import type { MarkingQueueItem } from "@/lib/database.types";

// The marking queue: PRACTICE work items and papers in DONE/MARKED across the
// roster. DONE = a student is waiting on the tutor; MARKED = corrections due
// next lesson.
export default async function MarkingQueuePanel({
  limit,
  showViewAll = false,
}: {
  limit?: number;
  showViewAll?: boolean;
}) {
  const supabase = await createClient();

  const base = supabase
    .from("v_marking_queue")
    .select("*")
    .order("days_in_status", { ascending: false });
  const { data } = await (limit ? base.limit(limit) : base);
  const rows = (data ?? []) as MarkingQueueItem[];

  // Resolve enrollment -> student id for deep links.
  const enrollmentIds = [...new Set(rows.map((r) => r.enrollment_id))];
  const studentByEnrollment = new Map<string, string>();
  if (enrollmentIds.length) {
    const { data: enr } = await supabase
      .from("enrollments")
      .select("id,student_id")
      .in("id", enrollmentIds);
    for (const e of enr ?? []) studentByEnrollment.set(e.id, e.student_id);
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-soft">To mark / to review</h2>
        {showViewAll && rows.length > 0 && (
          <Link href="/marking" className="text-xs text-accent">View all</Link>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="card text-sm text-ink-soft">Nothing waiting to be marked 🎉</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          {rows.map((r) => {
            const studentId = studentByEnrollment.get(r.enrollment_id);
            const href = studentId
              ? `/students/${studentId}?tab=indepth&item=${r.item_id}`
              : "#";
            const m = STATUS_META[r.status];
            return (
              <Link
                key={`${r.kind}-${r.item_id}`}
                href={href}
                className="flex items-center gap-2 border-b border-line/70 px-3 py-2.5 last:border-0 hover:bg-gray-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{r.student_name}</span>
                  <span className="ml-1 text-xs text-ink-faint">· {r.level} {r.subject}</span>
                  <div className="truncate text-sm text-ink-soft">{r.label}</div>
                </span>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-2xs font-medium ${m.cls}`}>
                  {m.short}
                </span>
                <span className="w-14 shrink-0 text-right text-2xs text-ink-faint">
                  {r.days_in_status}d
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
