import LessonActions from "@/components/LessonActions";
import { formatTime, MODE_LABELS, mapsUrl } from "@/lib/format";
import { formatMoney, lessonAmountCents } from "@/lib/money";
import type { LessonVM } from "@/lib/lesson-vm";

const MODE_ICON: Record<string, string> = {
  STUDENT_HOME: "🏠",
  TUTOR_HOME: "🏫",
  ONLINE: "💻",
};

export default function LessonCard({
  lesson,
  showEditDelete = false,
}: {
  lesson: LessonVM;
  showEditDelete?: boolean;
}) {
  const end = new Date(
    new Date(lesson.startsAt).getTime() + lesson.durationMin * 60_000,
  ).toISOString();
  const resolvedFree = lesson.status === "CANCELLED_FREE";

  return (
    <div className={`card ${lesson.status !== "SCHEDULED" ? "bg-gray-50" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-semibold">
          {formatTime(lesson.startsAt)} – {formatTime(end)}
        </div>
        <div className="text-sm text-gray-600">
          {MODE_ICON[lesson.mode]} {MODE_LABELS[lesson.mode]}
          {!resolvedFree && (
            <span className="ml-2">
              {formatMoney(lessonAmountCents(lesson.durationMin, lesson.rateCents))}
            </span>
          )}
        </div>
      </div>
      <div className="mt-0.5">
        <span className="font-medium">{lesson.studentName}</span>{" "}
        <span className="text-sm text-gray-600">· {lesson.subjectLevel}</span>
      </div>
      {lesson.address && (
        <div className="text-sm">
          <a href={mapsUrl(lesson.address)} target="_blank" rel="noreferrer" className="underline">
            {lesson.address}
          </a>
        </div>
      )}
      <LessonActions lesson={lesson} showEditDelete={showEditDelete} />
    </div>
  );
}
