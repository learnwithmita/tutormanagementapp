import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import StudentsList, { type StudentRow } from "./StudentsList";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const supabase = await createClient();

  const [{ data: students }, { data: balances }] = await Promise.all([
    supabase
      .from("students")
      .select(
        "id,name,school,archived_at,payer_id, payer:payers(id,name), enrollments(id,subject,level,archived_at)",
      )
      .order("name"),
    supabase.from("v_payer_balances").select("payer_id,balance_cents"),
  ]);

  const balanceByPayer = new Map<string, number>(
    (balances ?? []).map((b: { payer_id: string; balance_cents: number }) => [
      b.payer_id,
      b.balance_cents,
    ]),
  );

  const rows: StudentRow[] = (students ?? []).map((s: any) => {
    const payer = Array.isArray(s.payer) ? s.payer[0] : s.payer;
    return {
      id: s.id,
      name: s.name,
      school: s.school,
      archived: s.archived_at != null,
      payerId: s.payer_id,
      payerName: payer?.name ?? "—",
      chips: (s.enrollments ?? [])
        .filter((e: any) => e.archived_at == null)
        .map((e: any) => `${e.level} ${e.subject}`),
      balanceCents: balanceByPayer.get(s.payer_id) ?? 0,
    };
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Students</h1>
        <Link href="/students/new" className="btn btn-primary">
          + New student
        </Link>
      </div>
      <StudentsList rows={rows} />
    </div>
  );
}
