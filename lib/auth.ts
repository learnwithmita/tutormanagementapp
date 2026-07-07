import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tutor } from "@/lib/database.types";

// The authenticated user id, or redirect to /login. Middleware already guards
// routes; this is a typed convenience for server code.
export async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user.id;
}

// The tutor profile row for the current user, or null if setup isn't done.
export async function getTutor(): Promise<Tutor | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("tutors")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return (data as Tutor) ?? null;
}

// Require a completed tutor profile; otherwise send to /setup.
export async function requireTutor(): Promise<Tutor> {
  const tutor = await getTutor();
  if (!tutor) redirect("/setup");
  return tutor;
}
