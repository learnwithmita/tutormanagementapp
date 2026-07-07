import { requireTutor } from "@/lib/auth";
import SettingsForm from "./SettingsForm";

export default async function SettingsPage() {
  const tutor = await requireTutor();
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Settings</h1>
      <SettingsForm tutor={tutor} />
    </div>
  );
}
