"use client";

import { useState, useTransition } from "react";
import {
  completeLesson,
  cancelLesson,
  noShowLesson,
  undoComplete,
  rescheduleLesson,
  deleteLesson,
  updateLesson,
  recordLessonPayment,
  type LessonResult,
  type FrozenBill,
} from "@/app/(app)/lessons/actions";
import { skipLesson, editRecurringFuture } from "@/app/(app)/lessons/recurring";
import FrozenBillDialog from "@/components/FrozenBillDialog";
import LessonStatusBadge from "@/components/LessonStatusBadge";
import { centsToInput, parseDollarsToCents, lessonAmountCents } from "@/lib/money";
import { todaySGT } from "@/lib/format";
import type { LessonVM } from "@/lib/lesson-vm";
import type { PaymentMethod, TeachingMode } from "@/lib/database.types";

// Singapore is always +08:00 (no DST).
function sgtIso(date: string, time: string): string {
  return `${date}T${time}:00+08:00`;
}
function sgtDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}
function dowOf(date: string): number {
  // date is YYYY-MM-DD; interpret at noon SGT to avoid boundary issues.
  return new Date(`${date}T12:00:00+08:00`).getUTCDay();
}

const MODE_OPTIONS: { value: TeachingMode; label: string }[] = [
  { value: "STUDENT_HOME", label: "Student's home" },
  { value: "TUTOR_HOME", label: "My home" },
  { value: "ONLINE", label: "Online" },
];

export default function LessonActions({
  lesson,
  showEditDelete = false,
}: {
  lesson: LessonVM;
  showEditDelete?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [frozen, setFrozen] = useState<FrozenBill | null>(null);
  const [panel, setPanel] = useState<
    "none" | "complete" | "cancel" | "reschedule" | "edit" | "pay"
  >("none");

  // Per-lesson payment fields
  const [payAmount, setPayAmount] = useState(
    centsToInput(lessonAmountCents(lesson.durationMin, lesson.rateCents)),
  );
  const [payDate, setPayDate] = useState(todaySGT());
  const [payMethod, setPayMethod] = useState<PaymentMethod>("PAYNOW");

  const [notes, setNotes] = useState("");
  const dateStr = sgtDate(lesson.startsAt);
  const [rDate, setRDate] = useState(dateStr);
  const [rTime, setRTime] = useState(lesson.startTimeHHMM);

  // Edit fields
  const [eDate, setEDate] = useState(dateStr);
  const [eTime, setETime] = useState(lesson.startTimeHHMM);
  const [eDur, setEDur] = useState(String(lesson.durationMin));
  const [eRate, setERate] = useState(centsToInput(lesson.rateCents));
  const [eMode, setEMode] = useState<TeachingMode>(lesson.mode);

  function handle(result: LessonResult) {
    if (result.ok) {
      setPanel("none");
      setError(null);
      return;
    }
    if (result.frozen) setFrozen(result.frozen);
    else if (result.error) setError(result.error);
  }
  function run(fn: () => Promise<LessonResult>) {
    setError(null);
    startTransition(async () => handle(await fn()));
  }

  const isScheduled = lesson.status === "SCHEDULED";
  const isCompleted = lesson.status === "COMPLETED";

  return (
    <div className="mt-2">
      {error && <div className="banner banner-error mb-2">{error}</div>}

      {/* COMPLETED: note preview + per-lesson payment + Undo */}
      {isCompleted && (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-green-700">✓ Completed</span>
            {lesson.notes && (
              <span className="truncate text-xs text-gray-500">— {lesson.notes}</span>
            )}

            {/* Per-lesson payment status / action */}
            {lesson.paid ? (
              <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-2xs font-medium text-emerald-800">
                💰 Paid
              </span>
            ) : lesson.billed ? (
              <span className="chip">On a bill</span>
            ) : lesson.payerBillingCycle === "PER_LESSON" && panel === "none" ? (
              <button
                className="btn btn-sm"
                disabled={pending}
                onClick={() => setPanel("pay")}
              >
                Record payment
              </button>
            ) : null}

            {/* Undo only while the lesson isn't on a bill */}
            {!lesson.billed && (
              <button
                className="btn ml-auto"
                disabled={pending}
                onClick={() => run(() => undoComplete(lesson.id))}
              >
                Undo
              </button>
            )}
          </div>

          {/* Payment panel */}
          {panel === "pay" && (
            <div className="mt-2 flex flex-wrap items-end gap-2 border border-gray-300 p-2">
              <div>
                <label className="label">Amount ($)</label>
                <input
                  className="input w-24"
                  inputMode="decimal"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Date</label>
                <input
                  type="date"
                  className="input"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Method</label>
                <select
                  className="input"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                >
                  <option value="PAYNOW">PayNow</option>
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <button
                className="btn btn-primary"
                disabled={pending}
                onClick={() => {
                  const cents = parseDollarsToCents(payAmount);
                  if (cents == null || cents <= 0) return setError("Enter a valid amount.");
                  run(() =>
                    recordLessonPayment(lesson.id, {
                      amountCents: cents,
                      paidAt: payDate,
                      method: payMethod,
                    }),
                  );
                }}
              >
                Save payment
              </button>
              <button className="btn" onClick={() => setPanel("none")}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Resolved (cancelled / no-show) */}
      {!isScheduled && !isCompleted && <LessonStatusBadge status={lesson.status} />}

      {/* SCHEDULED: full action set */}
      {isScheduled && panel === "none" && (
        <div className="flex flex-wrap gap-1">
          <button className="btn btn-primary" disabled={pending} onClick={() => setPanel("complete")}>
            Complete
          </button>
          <button className="btn" disabled={pending} onClick={() => setPanel("cancel")}>
            Cancel
          </button>
          <button className="btn" disabled={pending} onClick={() => run(() => noShowLesson(lesson.id))}>
            No-show
          </button>
          <button className="btn" disabled={pending} onClick={() => setPanel("reschedule")}>
            Reschedule
          </button>
          {lesson.recurring && (
            <button className="btn" disabled={pending} onClick={() => run(() => skipLesson(lesson.id))}>
              Skip this week
            </button>
          )}
          {showEditDelete && (
            <button className="btn" disabled={pending} onClick={() => setPanel("edit")}>
              Edit
            </button>
          )}
          {showEditDelete && <DeleteButton lessonId={lesson.id} onResult={handle} pending={pending} run={run} />}
        </div>
      )}

      {/* Edit/Delete for resolved lessons on calendar */}
      {!isScheduled && showEditDelete && panel === "none" && (
        <div className="mt-1 flex gap-1">
          <button className="btn" disabled={pending} onClick={() => setPanel("edit")}>
            Edit
          </button>
          <DeleteButton lessonId={lesson.id} onResult={handle} pending={pending} run={run} />
        </div>
      )}

      {/* Complete panel */}
      {panel === "complete" && (
        <div className="mt-1 space-y-2">
          <textarea
            className="input"
            rows={2}
            placeholder="What was covered / homework (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex gap-1">
            <button
              className="btn btn-primary"
              disabled={pending}
              onClick={() => run(() => completeLesson(lesson.id, notes))}
            >
              Save
            </button>
            <button className="btn" onClick={() => setPanel("none")}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Cancel submenu */}
      {panel === "cancel" && (
        <div className="mt-1 flex flex-wrap gap-1">
          <button
            className="btn"
            disabled={pending}
            onClick={() => run(() => cancelLesson(lesson.id, true))}
          >
            Cancel — still charged
          </button>
          <button
            className="btn"
            disabled={pending}
            onClick={() => run(() => cancelLesson(lesson.id, false))}
          >
            Cancel — no charge
          </button>
          <button className="btn" onClick={() => setPanel("none")}>
            Back
          </button>
        </div>
      )}

      {/* Reschedule panel */}
      {panel === "reschedule" && (
        <div className="mt-1 flex flex-wrap items-end gap-2">
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={rDate} onChange={(e) => setRDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Time</label>
            <input type="time" className="input" value={rTime} onChange={(e) => setRTime(e.target.value)} />
          </div>
          <button
            className="btn btn-primary"
            disabled={pending}
            onClick={() => run(() => rescheduleLesson(lesson.id, sgtIso(rDate, rTime)))}
          >
            Save
          </button>
          <button className="btn" onClick={() => setPanel("none")}>
            Cancel
          </button>
        </div>
      )}

      {/* Edit panel */}
      {panel === "edit" && (
        <EditPanel
          lesson={lesson}
          eDate={eDate}
          eTime={eTime}
          eDur={eDur}
          eRate={eRate}
          eMode={eMode}
          setEDate={setEDate}
          setETime={setETime}
          setEDur={setEDur}
          setERate={setERate}
          setEMode={setEMode}
          pending={pending}
          onCancel={() => setPanel("none")}
          onSaveThis={() => {
            const rate = parseDollarsToCents(eRate);
            if (rate == null || rate <= 0) return setError("Enter a valid rate.");
            run(() =>
              updateLesson({
                lessonId: lesson.id,
                startsAt: sgtIso(eDate, eTime),
                durationMin: Number(eDur),
                rateCents: rate,
                mode: eMode,
                notes: lesson.notes,
              }),
            );
          }}
          onSaveFuture={
            lesson.recurring && lesson.scheduleId
              ? () =>
                  run(() =>
                    editRecurringFuture({
                      scheduleId: lesson.scheduleId!,
                      studentId: "",
                      dayOfWeek: dowOf(eDate),
                      startTime: eTime,
                      durationMin: Number(eDur),
                    }),
                  )
              : undefined
          }
        />
      )}

      {frozen && (
        <FrozenBillDialog frozen={frozen} onClose={() => setFrozen(null)} />
      )}
    </div>
  );
}

function DeleteButton({
  lessonId,
  pending,
  run,
}: {
  lessonId: string;
  onResult: (r: LessonResult) => void;
  pending: boolean;
  run: (fn: () => Promise<LessonResult>) => void;
}) {
  return (
    <button
      className="btn btn-danger"
      disabled={pending}
      onClick={() => {
        if (confirm("Delete this lesson? This cannot be undone.")) {
          run(() => deleteLesson(lessonId));
        }
      }}
    >
      Delete
    </button>
  );
}

function EditPanel(props: {
  lesson: LessonVM;
  eDate: string;
  eTime: string;
  eDur: string;
  eRate: string;
  eMode: TeachingMode;
  setEDate: (v: string) => void;
  setETime: (v: string) => void;
  setEDur: (v: string) => void;
  setERate: (v: string) => void;
  setEMode: (v: TeachingMode) => void;
  pending: boolean;
  onCancel: () => void;
  onSaveThis: () => void;
  onSaveFuture?: () => void;
}) {
  return (
    <div className="mt-1 space-y-2 border border-gray-300 p-2">
      <div className="flex flex-wrap gap-2">
        <div>
          <label className="label">Date</label>
          <input type="date" className="input" value={props.eDate} onChange={(e) => props.setEDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Time</label>
          <input type="time" className="input" value={props.eTime} onChange={(e) => props.setETime(e.target.value)} />
        </div>
        <div>
          <label className="label">Duration (min)</label>
          <input className="input w-24" inputMode="numeric" value={props.eDur} onChange={(e) => props.setEDur(e.target.value)} />
        </div>
        <div>
          <label className="label">Rate ($/h)</label>
          <input className="input w-24" inputMode="decimal" value={props.eRate} onChange={(e) => props.setERate(e.target.value)} />
        </div>
      </div>
      <div>
        <span className="label">Mode</span>
        <div className="flex flex-wrap gap-3 text-sm">
          {MODE_OPTIONS.map((m) => (
            <label key={m.value}>
              <input
                type="radio"
                className="mr-1"
                checked={props.eMode === m.value}
                onChange={() => props.setEMode(m.value)}
              />
              {m.label}
            </label>
          ))}
        </div>
      </div>
      {props.onSaveFuture && (
        <p className="banner banner-info text-xs">
          This is a recurring lesson. Choose whether your change applies to this
          occurrence only or to all future occurrences. (Rate &amp; mode changes
          apply to this lesson only.)
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        <button className="btn btn-primary" disabled={props.pending} onClick={props.onSaveThis}>
          {props.onSaveFuture ? "This lesson only" : "Save"}
        </button>
        {props.onSaveFuture && (
          <button className="btn" disabled={props.pending} onClick={props.onSaveFuture}>
            This &amp; all future
          </button>
        )}
        <button className="btn" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
