import { createClient } from "@/lib/supabase/server";
import NewStudentForm, { type PayerOption } from "./NewStudentForm";

export const dynamic = "force-dynamic";

export default async function NewStudentPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payers")
    .select("id,name")
    .is("archived_at", null)
    .order("name");

  const payers: PayerOption[] = (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
  }));

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">New student</h1>
      <NewStudentForm payers={payers} />
    </div>
  );
}
