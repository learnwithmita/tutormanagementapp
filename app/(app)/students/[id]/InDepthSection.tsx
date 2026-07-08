"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ComboInput from "@/components/ComboInput";
import {
  createWorkItem,
  createPaper,
  changeStatus,
  setDates,
  setPaperScore,
  setWorkRemark,
  archiveWork,
  deleteWork,
  type WorkResult,
} from "./work-actions";
import {
  STATUS_META,
  stagesFor,
  EXAM_TYPE_SUGGESTIONS,
  type WorkKind,
} from "@/lib/progress";
import type { ProgressStatus, WorkItemType } from "@/lib/database.types";

export type TopicOption = { id: string; name: string };
export type ItemVM = {
  kind: "WORK_ITEM" | "PAPER";
  id: string;
  type: WorkItemType | null;
  chip: "N" | "P" | "PP";
  label: string;
  topicId: string | null;
  status: ProgressStatus;
  startedAt: string | null;
  completedAt: string | null;
  scoreText: string | null;
  score: number | null;
  maxScore: number | null;
  attempt: number | null;
  remark: string | null;
  paper: { school: string; level: string; examType: string; year: number } | null;
  createdAt: string;
};

const CHIP_CLS: Record<string, string> = {
  N: "border-sky-300 bg-sky-50 text-sky-700",
  P: "border-indigo-300 bg-indigo-50 text-indigo-700",
  PP: "border-rose-300 bg-rose-50 text-rose-700",
};

function StatusChip({ status }: { status: ProgressStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-2xs font-medium ${m.cls}`} title={m.hint}>
      {m.short}
    </span>
  );
}

export default function InDepthSection({
  studentId,
  enrollmentId,
  enrollmentLevel,
  topics,
  items,
  stats,
  initialTopicFilter,
  highlightId,
}: {
  studentId: string;
  enrollmentId: string;
  enrollmentLevel: string;
  topics: TopicOption[];
  items: ItemVM[];
  stats: { total: number; completed: number; avg: number | null; best: number | null; latest: number | null } | null;
  initialTopicFilter: string | null;
  highlightId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<"none" | "choose" | "NOTES" | "PRACTICE" | "PAPER">("none");
  const [filter, setFilter] = useState<"ALL" | "N" | "P" | "PP" | "DONE" | "MARKED">("ALL");
  const [topicFilter, setTopicFilter] = useState<string>(
    initialTopicFilter && topics.some((t) => t.id === initialTopicFilter) ? initialTopicFilter : "",
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    highlightId && items.some((i) => i.id === highlightId) ? highlightId : null,
  );

  const schoolSuggestions = useMemo(
    () => [...new Set(items.filter((i) => i.paper).map((i) => i.paper!.school))],
    [items],
  );
  const levelSuggestions = useMemo(
    () => [...new Set([enrollmentLevel, ...items.filter((i) => i.paper).map((i) => i.paper!.level)])],
    [items, enrollmentLevel],
  );

  const filtered = items.filter((it) => {
    if (topicFilter && it.topicId !== topicFilter) return false;
    if (filter === "N") return it.chip === "N";
    if (filter === "P") return it.chip === "P";
    if (filter === "PP") return it.chip === "PP";
    if (filter === "DONE") return it.status === "DONE";
    if (filter === "MARKED") return it.status === "MARKED";
    return true;
  });

  const selected = items.find((i) => i.id === selectedId) ?? null;

  function run(fn: () => Promise<WorkResult>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else {
        after?.();
        router.refresh();
      }
    });
  }

  const noTopics = topics.length === 0;

  return (
    <div className="space-y-3">
      {error && <div className="banner banner-error">{error}</div>}

      {/* Add */}
      {addMode === "none" && (
        <button className="btn btn-primary" onClick={() => setAddMode("choose")}>+ Add</button>
      )}
      {addMode === "choose" && (
        <div className="card flex flex-wrap gap-2">
          <button className="btn" disabled={noTopics} title={noTopics ? "Define the syllabus first" : ""} onClick={() => setAddMode("NOTES")}>Notes</button>
          <button className="btn" disabled={noTopics} title={noTopics ? "Define the syllabus first" : ""} onClick={() => setAddMode("PRACTICE")}>Practice</button>
          <button className="btn" onClick={() => setAddMode("PAPER")}>Practice paper</button>
          <button className="btn btn-ghost" onClick={() => setAddMode("none")}>Cancel</button>
          {noTopics && <p className="w-full text-xs text-ink-faint">Define the syllabus first to add Notes/Practice.</p>}
        </div>
      )}
      {(addMode === "NOTES" || addMode === "PRACTICE") && (
        <AddWorkForm
          type={addMode}
          topics={topics}
          onCancel={() => setAddMode("none")}
          onSave={(topicId, title, status) =>
            run(() => createWorkItem({ studentId, enrollmentId, type: addMode as WorkItemType, topicId, title, status }), () => setAddMode("none"))
          }
          pending={pending}
        />
      )}
      {addMode === "PAPER" && (
        <AddPaperForm
          enrollmentLevel={enrollmentLevel}
          schoolSuggestions={schoolSuggestions}
          levelSuggestions={levelSuggestions}
          onCancel={() => setAddMode("none")}
          onSave={(p) => run(() => createPaper({ studentId, enrollmentId, ...p }), () => setAddMode("none"))}
          pending={pending}
        />
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-1">
        {([
          ["ALL", "All"],
          ["N", "Notes"],
          ["P", "Practice"],
          ["PP", "Papers"],
          ["DONE", "Needs marking"],
          ["MARKED", "To review"],
        ] as const).map(([k, lbl]) => (
          <button key={k} className={`chip ${filter === k ? "bg-accent-soft text-accent-dark" : ""}`} onClick={() => setFilter(k)}>
            {lbl}
          </button>
        ))}
        {topics.length > 0 && (
          <select className="input ml-1 h-8 w-auto py-0.5 text-xs" value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}>
            <option value="">All topics</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="text-sm text-ink-soft">Nothing here yet.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          {filtered.map((it) => (
            <button
              key={it.id}
              onClick={() => setSelectedId(it.id)}
              className={`flex w-full items-center gap-2 border-b border-line/70 px-3 py-2.5 text-left last:border-0 hover:bg-gray-50 ${
                it.id === highlightId ? "bg-amber-50" : ""
              }`}
            >
              <span className={`inline-block rounded-md border px-1.5 py-0.5 text-2xs font-bold ${CHIP_CLS[it.chip]}`}>{it.chip}</span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{it.label}</span>
                {it.attempt && <span className="ml-1 chip">Attempt {it.attempt}</span>}
                <span className="ml-2 text-xs text-ink-faint">
                  {it.startedAt ?? "—"}{it.completedAt ? ` → ${it.completedAt}` : ""}
                  {it.scoreText ? ` · ${it.scoreText}` : it.chip === "PP" && it.status === "COMPLETED" ? " · no score" : ""}
                </span>
              </span>
              <StatusChip status={it.status} />
            </button>
          ))}
        </div>
      )}

      {/* Papers footer stats */}
      {stats && stats.total > 0 && (
        <div className="flex flex-wrap gap-3 text-sm text-ink-soft">
          <span>{stats.completed} paper{stats.completed === 1 ? "" : "s"} completed</span>
          {stats.avg != null && <span>· avg {stats.avg}%</span>}
          {stats.best != null && <span>· best {stats.best}%</span>}
          {stats.latest != null && <span>· latest {stats.latest}%</span>}
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <ItemDrawer
          item={selected}
          studentId={studentId}
          onClose={() => setSelectedId(null)}
          run={run}
          pending={pending}
        />
      )}
    </div>
  );
}

function AddWorkForm({
  type,
  topics,
  onCancel,
  onSave,
  pending,
}: {
  type: "NOTES" | "PRACTICE";
  topics: TopicOption[];
  onCancel: () => void;
  onSave: (topicId: string, title: string, status: ProgressStatus) => void;
  pending: boolean;
}) {
  const kind: WorkKind = type === "NOTES" ? "NOTES" : "PRACTICE";
  const [topicId, setTopicId] = useState("");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<ProgressStatus>("IN_PROGRESS");
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="card space-y-2">
      <h3 className="font-semibold">Add {type === "NOTES" ? "notes" : "practice"}</h3>
      {err && <div className="banner banner-error">{err}</div>}
      <div>
        <label className="label">Topic</label>
        <select className="input" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
          <option value="">Choose a topic…</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Title (optional)</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. TYS Ex 4B Q1–15" />
      </div>
      <div>
        <label className="label">Status</label>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as ProgressStatus)}>
          {stagesFor(kind).map((s) => (
            <option key={s} value={s}>{STATUS_META[s].label}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button
          className="btn btn-primary"
          disabled={pending}
          onClick={() => {
            if (!topicId) return setErr("Choose a topic");
            onSave(topicId, title, status);
          }}
        >Save</button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function AddPaperForm({
  enrollmentLevel,
  schoolSuggestions,
  levelSuggestions,
  onCancel,
  onSave,
  pending,
}: {
  enrollmentLevel: string;
  schoolSuggestions: string[];
  levelSuggestions: string[];
  onCancel: () => void;
  onSave: (p: {
    school: string; level: string; examType: string; year: number; status: ProgressStatus; score: string; maxScore: string;
  }) => void;
  pending: boolean;
}) {
  const [school, setSchool] = useState("");
  const [level, setLevel] = useState(enrollmentLevel);
  const [examType, setExamType] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [status, setStatus] = useState<ProgressStatus>("IN_PROGRESS");
  const [score, setScore] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="card space-y-2">
      <h3 className="font-semibold">Add practice paper</h3>
      {err && <div className="banner banner-error">{err}</div>}
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="label">School</label>
          <ComboInput value={school} onChange={setSchool} suggestions={schoolSuggestions} placeholder="e.g. ABC Secondary" />
        </div>
        <div>
          <label className="label">Level</label>
          <ComboInput value={level} onChange={setLevel} suggestions={levelSuggestions} />
        </div>
        <div>
          <label className="label">Paper type</label>
          <ComboInput value={examType} onChange={setExamType} suggestions={EXAM_TYPE_SUGGESTIONS} placeholder="WA1 / Mid-Year / Prelim…" />
        </div>
        <div>
          <label className="label">Year</label>
          <input className="input" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as ProgressStatus)}>
            {stagesFor("PAPER").map((s) => (
              <option key={s} value={s}>{STATUS_META[s].label}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Score</label>
            <input className="input" inputMode="decimal" value={score} onChange={(e) => setScore(e.target.value)} />
          </div>
          <div>
            <label className="label">Max</label>
            <input className="input" inputMode="decimal" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          className="btn btn-primary"
          disabled={pending}
          onClick={() => {
            if (!school.trim()) return setErr("School is required");
            if (!examType.trim()) return setErr("Paper type is required");
            const y = Number(year);
            if (!Number.isInteger(y) || y < 2000 || y > 2100) return setErr("Enter a valid year");
            onSave({ school, level, examType, year: y, status, score, maxScore });
          }}
        >Save</button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function ItemDrawer({
  item,
  studentId,
  onClose,
  run,
  pending,
}: {
  item: ItemVM;
  studentId: string;
  onClose: () => void;
  run: (fn: () => Promise<WorkResult>, after?: () => void) => void;
  pending: boolean;
}) {
  const kind: WorkKind = item.kind === "PAPER" ? "PAPER" : item.type === "NOTES" ? "NOTES" : "PRACTICE";
  const stages = stagesFor(kind);

  const [started, setStarted] = useState(item.startedAt ?? "");
  const [completed, setCompleted] = useState(item.completedAt ?? "");
  const [score, setScore] = useState(item.score != null ? String(item.score) : "");
  const [maxScore, setMaxScore] = useState(item.maxScore != null ? String(item.maxScore) : "");
  const [remark, setRemark] = useState(item.remark ?? "");

  const canDelete = item.status === "NOT_STARTED" && (item.kind !== "PAPER" || item.score == null);
  const promptScore = item.kind === "PAPER" && item.status === "MARKED" && item.score == null;

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-auto bg-canvas p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold">{item.label}</div>
            {item.attempt && <span className="chip mt-1">Attempt {item.attempt}</span>}
          </div>
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>

        {/* Pipeline stepper */}
        <div className="mb-3">
          <div className="label">Status</div>
          <div className="flex flex-wrap gap-1">
            {stages.map((s) => {
              const active = s === item.status;
              return (
                <button
                  key={s}
                  disabled={pending || active}
                  onClick={() => run(() => changeStatus({ kind: item.kind, id: item.id, studentId, newStatus: s }))}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                    active ? "border-accent bg-accent text-white" : "border-line bg-white text-ink-soft hover:bg-gray-50"
                  }`}
                  title={STATUS_META[s].hint}
                >
                  {STATUS_META[s].label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Dates */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <label className="label">Started</label>
            <input type="date" className="input" value={started} onChange={(e) => setStarted(e.target.value)}
              onBlur={() => run(() => setDates({ kind: item.kind, id: item.id, studentId, startedAt: started, completedAt: completed }))} />
          </div>
          <div>
            <label className="label">Completed</label>
            <input type="date" className="input" value={completed} onChange={(e) => setCompleted(e.target.value)}
              onBlur={() => run(() => setDates({ kind: item.kind, id: item.id, studentId, startedAt: started, completedAt: completed }))} />
          </div>
        </div>

        {/* Score (papers) */}
        {item.kind === "PAPER" && (
          <div className="mb-3">
            {promptScore && <div className="banner banner-info mb-2 text-xs">You just marked it — enter the score?</div>}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Score</label>
                <input className="input" inputMode="decimal" value={score} onChange={(e) => setScore(e.target.value)}
                  onBlur={() => run(() => setPaperScore({ id: item.id, studentId, score, maxScore }))} />
              </div>
              <div>
                <label className="label">Max</label>
                <input className="input" inputMode="decimal" value={maxScore} onChange={(e) => setMaxScore(e.target.value)}
                  onBlur={() => run(() => setPaperScore({ id: item.id, studentId, score, maxScore }))} />
              </div>
            </div>
          </div>
        )}

        {/* Remark */}
        <div className="mb-3">
          <label className="label">Remark</label>
          <textarea className="input" rows={2} value={remark} onChange={(e) => setRemark(e.target.value)}
            onBlur={() => run(() => setWorkRemark({ kind: item.kind, id: item.id, studentId, remark }))} />
        </div>

        <div className="flex gap-2">
          {canDelete ? (
            <button className="btn btn-danger" disabled={pending}
              onClick={() => { if (confirm("Delete this item?")) run(() => deleteWork({ kind: item.kind, id: item.id, studentId }), onClose); }}>
              Delete
            </button>
          ) : (
            <button className="btn btn-danger" disabled={pending}
              onClick={() => { if (confirm("Archive this item? It stays in history.")) run(() => archiveWork({ kind: item.kind, id: item.id, studentId }), onClose); }}>
              Archive
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
