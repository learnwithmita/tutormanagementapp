"use client";

import { useState, useTransition } from "react";
import ComboInput from "@/components/ComboInput";
import { createSyllabus } from "./actions";

export default function NewSyllabusForm({
  levels,
  subjects,
}: {
  levels: string[];
  subjects: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [level, setLevel] = useState("");
  const [subject, setSubject] = useState("");
  const [topicsText, setTopicsText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    if (!level.trim() || !subject.trim()) {
      setError("Level and subject are required.");
      return;
    }
    startTransition(async () => {
      const res = await createSyllabus({ level, subject, topicsText });
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      // On success the action redirects.
    });
  }

  return (
    <div className="card max-w-2xl space-y-3">
      {error && <div className="banner banner-error">{error}</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Level</label>
          <ComboInput value={level} onChange={setLevel} suggestions={levels} placeholder="e.g. Sec 2 G3" />
        </div>
        <div>
          <label className="label">Subject</label>
          <ComboInput value={subject} onChange={setSubject} suggestions={subjects} placeholder="e.g. Science" />
        </div>
      </div>
      <div>
        <label className="label">Topics — one per line</label>
        <textarea
          className="input font-mono"
          rows={6}
          value={topicsText}
          onChange={(e) => setTopicsText(e.target.value)}
          placeholder={"Algebra\nGeometry\nStatistics"}
        />
        <p className="mt-1 text-xs text-ink-faint">Duplicate lines are ignored automatically.</p>
      </div>
      <button className="btn btn-primary" disabled={pending} onClick={save}>
        {pending ? "Creating…" : "Create syllabus"}
      </button>
    </div>
  );
}
