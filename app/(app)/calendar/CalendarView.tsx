"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import LessonCard from "@/components/LessonCard";
import { formatTime } from "@/lib/format";
import type { LessonVM } from "@/lib/lesson-vm";

const SGT = "Asia/Singapore";
function sgtDateOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SGT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function statusDot(status: string): string {
  switch (status) {
    case "COMPLETED":
      return "text-green-700";
    case "NO_SHOW":
      return "text-red-700";
    case "CANCELLED_FREE":
    case "CANCELLED_BILLABLE":
      return "text-gray-400 line-through";
    default:
      return "text-gray-800";
  }
}

export default function CalendarView({
  month,
  lessons,
}: {
  month: string;
  lessons: LessonVM[];
}) {
  const [view, setView] = useState<"month" | "list">("month");
  const [selected, setSelected] = useState<LessonVM | null>(null);

  const [yStr, mStr] = month.split("-");
  const year = Number(yStr);
  const monthNum = Number(mStr); // 1-12
  const monthIndex = monthNum - 1;

  const prevMonth =
    monthNum === 1 ? `${year - 1}-12` : `${year}-${String(monthNum - 1).padStart(2, "0")}`;
  const nextMonth =
    monthNum === 12 ? `${year + 1}-01` : `${year}-${String(monthNum + 1).padStart(2, "0")}`;

  const monthLabel = new Date(`${month}-01T12:00:00+08:00`).toLocaleDateString("en-SG", {
    timeZone: SGT,
    month: "long",
    year: "numeric",
  });

  const byDate = useMemo(() => {
    const m = new Map<string, LessonVM[]>();
    for (const l of lessons) {
      const d = sgtDateOf(l.startsAt);
      (m.get(d) ?? m.set(d, []).get(d)!).push(l);
    }
    return m;
  }, [lessons]);

  const firstDow = new Date(`${month}-01T12:00:00+08:00`).getUTCDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: SGT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href={`/calendar?m=${prevMonth}`} className="btn">
            ‹
          </Link>
          <h1 className="min-w-40 text-center text-xl font-semibold">{monthLabel}</h1>
          <Link href={`/calendar?m=${nextMonth}`} className="btn">
            ›
          </Link>
        </div>
        <div className="flex gap-2">
          <button
            className={`btn ${view === "month" ? "btn-primary" : ""}`}
            onClick={() => setView("month")}
          >
            Month
          </button>
          <button
            className={`btn ${view === "list" ? "btn-primary" : ""}`}
            onClick={() => setView("list")}
          >
            List
          </button>
          <Link href="/lessons/new" className="btn btn-primary">
            + New lesson
          </Link>
        </div>
      </div>

      {view === "month" ? (
        <div className="grid grid-cols-7 gap-px border border-gray-300 bg-gray-300 text-xs">
          {WEEKDAYS.map((w) => (
            <div key={w} className="bg-gray-100 p-1 text-center font-semibold">
              {w}
            </div>
          ))}
          {cells.map((d, i) => {
            const dateStr =
              d != null ? `${month}-${String(d).padStart(2, "0")}` : null;
            const dayLessons = dateStr ? byDate.get(dateStr) ?? [] : [];
            const isToday = dateStr === todayStr;
            return (
              <div
                key={i}
                className={`min-h-20 bg-white p-1 align-top ${
                  d == null ? "bg-gray-50" : ""
                }`}
              >
                {d != null && (
                  <>
                    <div className={`text-right ${isToday ? "font-bold text-blue-700" : "text-gray-500"}`}>
                      {d}
                    </div>
                    <div className="space-y-0.5">
                      {dayLessons.map((l) => (
                        <button
                          key={l.id}
                          onClick={() => setSelected(l)}
                          className={`block w-full truncate text-left hover:underline ${statusDot(
                            l.status,
                          )}`}
                          title={`${formatTime(l.startsAt)} ${l.studentName}`}
                        >
                          {formatTime(l.startsAt)} {l.studentName}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-1">
          {lessons.length === 0 ? (
            <div className="card text-sm text-gray-600">No lessons this month.</div>
          ) : (
            lessons.map((l) => (
              <button
                key={l.id}
                onClick={() => setSelected(l)}
                className="block w-full border border-gray-200 bg-white px-2 py-1 text-left text-sm hover:bg-gray-50"
              >
                <span className="text-gray-500">
                  {sgtDateOf(l.startsAt)} {formatTime(l.startsAt)}
                </span>{" "}
                <span className={statusDot(l.status)}>{l.studentName}</span>{" "}
                <span className="text-xs text-gray-500">· {l.subjectLevel}</span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-20 flex justify-end bg-black/30" onClick={() => setSelected(null)}>
          <div
            className="h-full w-full max-w-md overflow-auto bg-gray-100 p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex justify-between">
              <h2 className="font-semibold">Lesson</h2>
              <button className="btn" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
            <LessonCard lesson={selected} showEditDelete />
          </div>
        </div>
      )}
    </div>
  );
}
