import type { LessonStatus } from "@/lib/database.types";

const MAP: Record<LessonStatus, { label: string; cls: string }> = {
  SCHEDULED: { label: "Scheduled", cls: "border-gray-400 bg-gray-100 text-gray-700" },
  COMPLETED: { label: "Completed", cls: "border-green-500 bg-green-50 text-green-800" },
  CANCELLED_BILLABLE: {
    label: "Cancelled — charged",
    cls: "border-orange-500 bg-orange-50 text-orange-800",
  },
  CANCELLED_FREE: {
    label: "Cancelled — free",
    cls: "border-gray-400 bg-gray-100 text-gray-500",
  },
  NO_SHOW: { label: "No-show", cls: "border-red-500 bg-red-50 text-red-800" },
};

export default function LessonStatusBadge({ status }: { status: LessonStatus }) {
  const s = MAP[status];
  return (
    <span className={`inline-block border px-1.5 py-0.5 text-xs ${s.cls}`}>
      {s.label}
    </span>
  );
}
