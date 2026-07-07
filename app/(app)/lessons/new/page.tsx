import { createClient } from "@/lib/supabase/server";
import NewLessonForm, { type StudentPick } from "./NewLessonForm";

export const dynamic = "force-dynamic";

export default async function NewLessonPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("students")
    .select(
      "id,name,default_mode, enrollments(id,subject,level,default_rate_cents,default_duration_min,archived_at)",
    )
    .is("archived_at", null)
    .order("name");

  const students: StudentPick[] = (data ?? [])
    .map((s: any) => ({
      id: s.id,
      name: s.name,
      defaultMode: s.default_mode,
      enrollments: (s.enrollments ?? [])
        .filter((e: any) => e.archived_at == null)
        .map((e: any) => ({
          id: e.id,
          subject: e.subject,
          level: e.level,
          rateCents: e.default_rate_cents,
          durationMin: e.default_duration_min,
        })),
    }))
    .filter((s: StudentPick) => s.enrollments.length > 0);

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">New lesson</h1>
      <NewLessonForm students={students} />
    </div>
  );
}
