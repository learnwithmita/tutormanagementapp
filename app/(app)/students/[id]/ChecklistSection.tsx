"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  toggleTopicCheck,
  setCheckDate,
  setTopicRemark,
} from "./checklist-actions";
import { formatDate } from "@/lib/format";

function todaySGT(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export type ChecklistTopic = {
  topicId: string;
  name: string;
  checked: boolean;
  checkedAt: string | null;
  remark: string | null;
  badges: {
    notesCompleted: number;
    notesInProgress: number;
    practiceDone: number;
    practiceMarked: number;
    practiceCompleted: number;
    practiceInProgress: number;
  };
};

function Badges({
  b,
  href,
}: {
  b: ChecklistTopic["badges"];
  href: string;
}) {
  const chips: { text: string; cls: string }[] = [];
  if (b.notesCompleted) chips.push({ text: `${b.notesCompleted} ✓N`, cls: "border-sky-300 bg-sky-50 text-sky-700" });
  if (b.notesInProgress) chips.push({ text: `${b.notesInProgress} N…`, cls: "border-sky-200 bg-sky-50 text-sky-600" });
  if (b.practiceDone) chips.push({ text: `P: ${b.practiceDone} done`, cls: "border-amber-300 bg-amber-50 text-amber-800" });
  if (b.practiceMarked) chips.push({ text: `P: ${b.practiceMarked} marked`, cls: "border-purple-300 bg-purple-50 text-purple-800" });
  if (b.practiceCompleted) chips.push({ text: `${b.practiceCompleted} ✓P`, cls: "border-emerald-300 bg-emerald-50 text-emerald-800" });
  if (b.practiceInProgress) chips.push({ text: `${b.practiceInProgress} P…`, cls: "border-indigo-200 bg-indigo-50 text-indigo-600" });
  if (chips.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map((c, i) => (
        <Link
          key={i}
          href={href}
          className={`inline-block rounded-full border px-1.5 py-0.5 text-2xs font-medium ${c.cls}`}
        >
          {c.text}
        </Link>
      ))}
    </span>
  );
}

function TopicRow({
  studentId,
  enrollmentId,
  topic,
}: {
  studentId: string;
  enrollmentId: string;
  topic: ChecklistTopic;
}) {
  const [, startTransition] = useTransition();
  const [checked, setChecked] = useState(topic.checked);
  const [checkedAt, setCheckedAt] = useState(topic.checkedAt);
  const [editingDate, setEditingDate] = useState(false);
  const [remarkOpen, setRemarkOpen] = useState(false);
  const [remark, setRemark] = useState(topic.remark ?? "");

  const deepLink = `/students/${studentId}?tab=indepth&topic=${topic.topicId}`;

  function toggle() {
    const next = !checked;
    setChecked(next); // optimistic
    setCheckedAt(next ? todaySGT() : null);
    startTransition(() =>
      toggleTopicCheck({ studentId, enrollmentId, topicId: topic.topicId, checked: next }).then(() => {}),
    );
  }

  return (
    <li className="px-3 py-2.5">
      <div className="flex items-start gap-3">
        <button
          onClick={toggle}
          aria-label={checked ? "Uncheck" : "Check"}
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-sm transition ${
            checked ? "border-accent bg-accent text-white" : "border-line bg-white text-transparent"
          }`}
        >
          ✓
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`font-medium ${checked ? "" : "text-ink"}`}>{topic.name}</span>
            {checked && checkedAt && !editingDate && (
              <button className="text-2xs text-ink-faint hover:underline" onClick={() => setEditingDate(true)}>
                ✓ {formatDate(`${checkedAt}T12:00:00+08:00`)}
              </button>
            )}
            {editingDate && (
              <input
                type="date"
                className="input h-7 w-auto py-0.5 text-xs"
                value={checkedAt ?? ""}
                onChange={(e) => {
                  setCheckedAt(e.target.value);
                  startTransition(() =>
                    setCheckDate({ studentId, enrollmentId, topicId: topic.topicId, date: e.target.value }).then(() => {}),
                  );
                }}
                onBlur={() => setEditingDate(false)}
                autoFocus
              />
            )}
            <Badges b={topic.badges} href={deepLink} />
            <button className="ml-auto text-2xs text-ink-faint hover:text-ink" onClick={() => setRemarkOpen((v) => !v)}>
              ✎ note
            </button>
          </div>
          {remarkOpen ? (
            <input
              className="input mt-1 text-sm"
              placeholder="Remark (e.g. weak at factorisation)"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              onBlur={() => {
                setRemarkOpen(false);
                startTransition(() =>
                  setTopicRemark({ studentId, enrollmentId, topicId: topic.topicId, remark }).then(() => {}),
                );
              }}
              autoFocus
            />
          ) : (
            remark && <p className="mt-0.5 text-xs text-ink-faint">{remark}</p>
          )}
        </div>
      </div>
    </li>
  );
}

export default function ChecklistSection({
  studentId,
  enrollmentId,
  topics,
}: {
  studentId: string;
  enrollmentId: string;
  topics: ChecklistTopic[];
}) {
  return (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
      {topics.map((t) => (
        <TopicRow key={t.topicId} studentId={studentId} enrollmentId={enrollmentId} topic={t} />
      ))}
    </ul>
  );
}
