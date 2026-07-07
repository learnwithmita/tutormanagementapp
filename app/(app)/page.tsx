import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { todaySGT } from "@/lib/format";
import { toLessonVM, LESSON_SELECT, type LessonVM } from "@/lib/lesson-vm";
import LessonCard from "@/components/LessonCard";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const supabase = await createClient();
  const today = todaySGT();
  const startIso = `${today}T00:00:00+08:00`;
  const endIso = new Date(new Date(startIso).getTime() + 24 * 3600_000).toISOString();

  const { data } = await supabase
    .from("lessons")
    .select(LESSON_SELECT)
    .gte("starts_at", startIso)
    .lt("starts_at", endIso)
    .order("starts_at");

  const lessons: LessonVM[] = (data ?? []).map(toLessonVM);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Today</h1>
        <Link href="/lessons/new" className="btn btn-primary">
          + Schedule lesson
        </Link>
      </div>

      {lessons.length === 0 ? (
        <div className="card text-sm text-gray-600">
          No lessons today.{" "}
          <Link href="/lessons/new" className="underline">
            Schedule a lesson
          </Link>
          .
        </div>
      ) : (
        <div className="space-y-2">
          {lessons.map((l) => (
            <LessonCard key={l.id} lesson={l} />
          ))}
        </div>
      )}
    </div>
  );
}
