import { requireTutor } from "@/lib/auth";
import Nav from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";

// Authenticated app shell. Guarantees a tutor profile exists (else -> /setup)
// and keeps the ~8-week recurring lesson horizon topped up on load.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireTutor();

  // Idempotent: safe to run on every load. Ignore failures (non-critical).
  try {
    const supabase = await createClient();
    await supabase.rpc("generate_all_recurring_lessons", { p_weeks: 8 });
  } catch {
    /* best-effort */
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-6 pb-28 sm:pb-10">{children}</main>
    </div>
  );
}
