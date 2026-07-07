import { createClient } from "@/lib/supabase/server";
import { todaySGT } from "@/lib/format";
import { toLessonVM, LESSON_SELECT, type LessonVM } from "@/lib/lesson-vm";
import CalendarView from "./CalendarView";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: { m?: string };
}) {
  const month = /^\d{4}-\d{2}$/.test(searchParams.m ?? "")
    ? searchParams.m!
    : todaySGT().slice(0, 7);

  const startIso = `${month}-01T00:00:00+08:00`;
  const [y, mo] = month.split("-").map(Number);
  const nextMonth = mo === 12 ? `${y! + 1}-01` : `${y}-${String(mo! + 1).padStart(2, "0")}`;
  const endIso = `${nextMonth}-01T00:00:00+08:00`;

  const supabase = await createClient();
  const { data } = await supabase
    .from("lessons")
    .select(LESSON_SELECT)
    .gte("starts_at", startIso)
    .lt("starts_at", endIso)
    .order("starts_at");

  const lessons: LessonVM[] = (data ?? []).map(toLessonVM);

  return <CalendarView month={month} lessons={lessons} />;
}
