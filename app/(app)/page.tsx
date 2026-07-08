import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { todaySGT } from "@/lib/format";
import { toLessonVM, LESSON_SELECT, type LessonVM } from "@/lib/lesson-vm";
import LessonCard from "@/components/LessonCard";
import MarkingQueuePanel from "@/components/MarkingQueuePanel";

export const dynamic = "force-dynamic";

const SGT = "Asia/Singapore";
function sgtDateOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SGT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}
function dowOf(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00+08:00`).getUTCDay(); // 0 Sun … 6 Sat
}
function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SGT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
function dayHeading(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00+08:00`).toLocaleDateString("en-SG", {
    timeZone: SGT,
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

export default async function ThisWeekPage() {
  const today = todaySGT();
  // Monday-start week containing today.
  const mondayOffset = (dowOf(today) + 6) % 7;
  const weekStart = addDays(today, -mondayOffset);
  const weekEnd = addDays(weekStart, 7);

  const startIso = `${weekStart}T00:00:00+08:00`;
  const endIso = `${weekEnd}T00:00:00+08:00`;

  const supabase = await createClient();
  const { data } = await supabase
    .from("lessons")
    .select(LESSON_SELECT)
    .gte("starts_at", startIso)
    .lt("starts_at", endIso)
    .order("starts_at");

  const lessons: LessonVM[] = (data ?? []).map(toLessonVM);
  const byDate = new Map<string, LessonVM[]>();
  for (const l of lessons) {
    const d = sgtDateOf(l.startsAt);
    (byDate.get(d) ?? byDate.set(d, []).get(d)!).push(l);
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const completed = lessons.filter((l) => l.status === "COMPLETED").length;
  const scheduled = lessons.filter((l) => l.status === "SCHEDULED").length;

  const rangeLabel = `${dayHeading(weekStart)} – ${dayHeading(addDays(weekEnd, -1))}`;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">This week</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            {rangeLabel} · {scheduled} to teach · {completed} done
          </p>
        </div>
        <Link href="/lessons/new" className="btn btn-primary">
          + Schedule lesson
        </Link>
      </div>

      {lessons.length === 0 ? (
        <div className="card text-center">
          <p className="text-ink-soft">No lessons scheduled this week.</p>
          <Link href="/lessons/new" className="btn btn-primary mt-3">
            Schedule a lesson
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {days.map((d) => {
            const dayLessons = byDate.get(d) ?? [];
            const isToday = d === today;
            if (dayLessons.length === 0 && !isToday) return null;
            return (
              <section key={d}>
                <div className="mb-2 flex items-center gap-2">
                  <h2 className={`text-sm font-semibold ${isToday ? "text-accent" : "text-ink-soft"}`}>
                    {isToday ? "Today" : dayHeading(d)}
                  </h2>
                  {isToday && (
                    <span className="text-2xs text-ink-faint">{dayHeading(d)}</span>
                  )}
                  <div className="h-px flex-1 bg-line" />
                </div>
                {dayLessons.length === 0 ? (
                  <p className="text-sm text-ink-faint">Nothing scheduled.</p>
                ) : (
                  <div className="space-y-2.5">
                    {dayLessons.map((l) => (
                      <LessonCard key={l.id} lesson={l} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <div className="mt-8">
        <MarkingQueuePanel limit={10} showViewAll />
      </div>
    </div>
  );
}
