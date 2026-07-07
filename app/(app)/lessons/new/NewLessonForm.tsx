"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createLesson } from "@/app/(app)/lessons/actions";
import { centsToInput, parseDollarsToCents } from "@/lib/money";
import type { TeachingMode } from "@/lib/database.types";

export type EnrollmentPick = {
  id: string;
  subject: string;
  level: string;
  rateCents: number;
  durationMin: number;
};
export type StudentPick = {
  id: string;
  name: string;
  defaultMode: TeachingMode;
  enrollments: EnrollmentPick[];
};

const MODE_OPTIONS: { value: TeachingMode; label: string }[] = [
  { value: "STUDENT_HOME", label: "Student's home" },
  { value: "TUTOR_HOME", label: "My home" },
  { value: "ONLINE", label: "Online" },
];

const SGT = "Asia/Singapore";
function todaySGT(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SGT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function nextHalfHourSGT(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SGT,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  let h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  if (m === 0) return `${String(h).padStart(2, "0")}:00`;
  if (m <= 30) return `${String(h).padStart(2, "0")}:30`;
  h = (h + 1) % 24;
  return `${String(h).padStart(2, "0")}:00`;
}
function sgtIso(date: string, time: string): string {
  return `${date}T${time}:00+08:00`;
}

export default function NewLessonForm({ students }: { students: StudentPick[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [studentId, setStudentId] = useState("");
  const [enrollmentId, setEnrollmentId] = useState("");
  const [date, setDate] = useState(todaySGT());
  const [time, setTime] = useState(nextHalfHourSGT());
  const [duration, setDuration] = useState("");
  const [rate, setRate] = useState("");
  const [mode, setMode] = useState<TeachingMode>("STUDENT_HOME");

  const [error, setError] = useState<string | null>(null);
  const [overlap, setOverlap] = useState<string | null>(null);

  const student = students.find((s) => s.id === studentId);
  const filtered = useMemo(() => {
    const n = search.trim().toLowerCase();
    return n ? students.filter((s) => s.name.toLowerCase().includes(n)) : students;
  }, [students, search]);

  function selectStudent(s: StudentPick) {
    setStudentId(s.id);
    setMode(s.defaultMode);
    if (s.enrollments.length === 1) {
      selectEnrollment(s.enrollments[0]!);
    } else {
      setEnrollmentId("");
      setDuration("");
      setRate("");
    }
  }
  function selectEnrollment(e: EnrollmentPick) {
    setEnrollmentId(e.id);
    setDuration(String(e.durationMin));
    setRate(centsToInput(e.rateCents));
  }

  const isPast = useMemo(() => {
    return new Date(sgtIso(date, time)).getTime() < Date.now();
  }, [date, time]);

  function submit(confirmOverlap: boolean) {
    setError(null);
    if (!enrollmentId) return setError("Pick a student and subject.");
    const rateCents = parseDollarsToCents(rate);
    if (rateCents == null || rateCents <= 0) return setError("Enter a valid rate.");
    const dur = Number(duration);
    if (!Number.isInteger(dur) || dur <= 0) return setError("Enter a valid duration.");

    startTransition(async () => {
      const res = await createLesson({
        enrollmentId,
        startsAt: sgtIso(date, time),
        durationMin: dur,
        rateCents,
        mode,
        confirmOverlap,
      });
      if (res.ok) {
        router.push("/calendar");
        router.refresh();
      } else if (res.overlap) {
        setOverlap(res.overlap);
      } else {
        setError(res.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-5">
      {error && <div className="banner banner-error">{error}</div>}
      {overlap && (
        <div className="banner banner-warn">
          <p>{overlap}</p>
          <div className="mt-1 flex gap-2">
            <button className="btn" disabled={pending} onClick={() => submit(true)}>
              Save anyway
            </button>
            <button className="btn" onClick={() => setOverlap(null)}>
              Change time
            </button>
          </div>
        </div>
      )}

      {/* Student picker */}
      <div className="card">
        <label className="label">Student</label>
        <input
          className="input max-w-sm"
          placeholder="Search active students…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="mt-2 max-h-40 overflow-auto border border-gray-200">
          {filtered.length === 0 ? (
            <div className="p-2 text-xs text-gray-500">No students found.</div>
          ) : (
            filtered.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => selectStudent(s)}
                className={`block w-full px-2 py-1 text-left text-sm hover:bg-gray-100 ${
                  s.id === studentId ? "bg-blue-100 font-semibold" : ""
                }`}
              >
                {s.name}
              </button>
            ))
          )}
        </div>

        {student && student.enrollments.length > 1 && (
          <div className="mt-2">
            <span className="label">Subject</span>
            <div className="flex flex-col gap-1 text-sm">
              {student.enrollments.map((e) => (
                <label key={e.id}>
                  <input
                    type="radio"
                    className="mr-1"
                    checked={enrollmentId === e.id}
                    onChange={() => selectEnrollment(e)}
                  />
                  {e.level} {e.subject} · {centsToInput(e.rateCents)}/h · {e.durationMin}min
                </label>
              ))}
            </div>
          </div>
        )}
        {student && enrollmentId && student.enrollments.length === 1 && (
          <p className="mt-2 text-sm text-gray-600">
            {student.enrollments[0]!.level} {student.enrollments[0]!.subject}
          </p>
        )}
      </div>

      {/* When / how */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Start time</label>
          <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div>
          <label className="label">Duration (minutes)</label>
          <input className="input" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} />
        </div>
        <div>
          <label className="label">Rate ($/h)</label>
          <input className="input" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
      </div>

      {isPast && (
        <p className="text-xs text-gray-500">
          This lesson is in the past — remember to mark it Completed.
        </p>
      )}

      <div>
        <span className="label">Mode</span>
        <div className="flex flex-wrap gap-4 text-sm">
          {MODE_OPTIONS.map((m) => (
            <label key={m.value}>
              <input
                type="radio"
                className="mr-1"
                checked={mode === m.value}
                onChange={() => setMode(m.value)}
              />
              {m.label}
            </label>
          ))}
        </div>
      </div>

      <button className="btn btn-primary" disabled={pending} onClick={() => submit(false)}>
        {pending ? "Saving…" : "Save lesson"}
      </button>
    </div>
  );
}
