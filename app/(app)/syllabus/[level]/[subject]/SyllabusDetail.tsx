"use client";

import { useState, useTransition } from "react";
import ComboInput from "@/components/ComboInput";
import {
  addTopic,
  renameTopic,
  reorderTopic,
  archiveTopic,
  unarchiveTopic,
  deleteTopic,
  duplicateSyllabus,
  type SyllabusResult,
} from "../../actions";

export type TopicRow = {
  id: string;
  name: string;
  archived: boolean;
  checkCount: number;
  workCount: number;
};

export default function SyllabusDetail({
  level,
  subject,
  rows,
  levels,
  subjects,
}: {
  level: string;
  subject: string;
  rows: TopicRow[];
  levels: string[];
  subjects: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newName, setNewName] = useState("");
  const [dupOpen, setDupOpen] = useState(false);
  const [dupLevel, setDupLevel] = useState("");
  const [dupSubject, setDupSubject] = useState("");

  const active = rows.filter((r) => !r.archived);
  const archived = rows.filter((r) => r.archived);

  function run(fn: () => Promise<SyllabusResult>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else after?.();
    });
  }

  return (
    <div className="space-y-4">
      {error && <div className="banner banner-error">{error}</div>}

      {/* Active topics */}
      {active.length === 0 ? (
        <p className="text-sm text-ink-soft">No topics yet — add the first below.</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
          {active.map((t, i) => (
            <li key={t.id} className="flex items-center gap-2 px-3 py-2.5">
              <div className="flex flex-col">
                <button
                  className="text-ink-faint hover:text-ink disabled:opacity-30"
                  disabled={pending || i === 0}
                  onClick={() => run(() => reorderTopic({ topicId: t.id, direction: "up", level, subject }))}
                  aria-label="Move up"
                >▲</button>
                <button
                  className="text-ink-faint hover:text-ink disabled:opacity-30"
                  disabled={pending || i === active.length - 1}
                  onClick={() => run(() => reorderTopic({ topicId: t.id, direction: "down", level, subject }))}
                  aria-label="Move down"
                >▼</button>
              </div>

              {editingId === t.id ? (
                <input
                  className="input flex-1"
                  value={editName}
                  autoFocus
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      run(() => renameTopic({ topicId: t.id, name: editName, level, subject }), () => setEditingId(null));
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
              ) : (
                <button
                  className="flex-1 text-left font-medium hover:underline"
                  onClick={() => { setEditingId(t.id); setEditName(t.name); }}
                >
                  {t.name}
                </button>
              )}

              {editingId === t.id ? (
                <>
                  <button className="btn btn-sm btn-primary" disabled={pending}
                    onClick={() => run(() => renameTopic({ topicId: t.id, name: editName, level, subject }), () => setEditingId(null))}>Save</button>
                  <button className="btn btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                </>
              ) : t.checkCount === 0 && t.workCount === 0 ? (
                <button
                  className="btn btn-sm btn-danger"
                  disabled={pending}
                  onClick={() => run(() => deleteTopic({ topicId: t.id, level, subject }))}
                >Delete</button>
              ) : (
                <button
                  className="btn btn-sm"
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`Archive "${t.name}"? ${t.checkCount} student check(s) and ${t.workCount} work item(s) reference it. It leaves checklists but stays in the % denominator so nobody's progress drops.`))
                      run(() => archiveTopic({ topicId: t.id, level, subject }));
                  }}
                >Archive</button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Add topic */}
      <div className="flex gap-2">
        <input
          className="input max-w-xs"
          placeholder="New topic name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim())
              run(() => addTopic({ level, subject, name: newName }), () => setNewName(""));
          }}
        />
        <button
          className="btn"
          disabled={pending || !newName.trim()}
          onClick={() => run(() => addTopic({ level, subject, name: newName }), () => setNewName(""))}
        >+ Add topic</button>
        <button className="btn" onClick={() => setDupOpen((v) => !v)}>Duplicate to…</button>
      </div>

      {/* Duplicate */}
      {dupOpen && (
        <div className="card max-w-xl space-y-2">
          <p className="text-sm text-ink-soft">Copy these topic names to another level/subject.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="label">Target level</label>
              <ComboInput value={dupLevel} onChange={setDupLevel} suggestions={levels} />
            </div>
            <div>
              <label className="label">Target subject</label>
              <ComboInput value={dupSubject} onChange={setDupSubject} suggestions={subjects} />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-primary"
              disabled={pending}
              onClick={() => run(() => duplicateSyllabus({ fromLevel: level, fromSubject: subject, toLevel: dupLevel, toSubject: dupSubject }))}
            >Copy topics</button>
            <button className="btn" onClick={() => setDupOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Archived */}
      {archived.length > 0 && (
        <div>
          <button className="text-sm text-ink-soft underline" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Hide" : "Show"} archived ({archived.length})
          </button>
          {showArchived && (
            <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-white">
              {archived.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-3 py-2 text-ink-soft">
                  <span className="line-through">{t.name}</span>
                  <button className="btn btn-sm" disabled={pending}
                    onClick={() => run(() => unarchiveTopic({ topicId: t.id, level, subject }))}>Unarchive</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
