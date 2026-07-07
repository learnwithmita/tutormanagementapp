"use client";

import { useState, useTransition } from "react";
import {
  createRecurringSlot,
  deleteRecurringSlot,
} from "@/app/(app)/lessons/recurring";
import { DAY_NAMES } from "@/lib/format";

export type SlotRow = {
  id: string;
  enrollmentId: string;
  dayOfWeek: number;
  startTime: string; // "HH:MM:SS"
  durationMin: number;
  futureCount: number;
};
export type EnrollmentLite = {
  id: string;
  label: string;
  defaultDuration: number;
};

function AddSlotForm({
  studentId,
  enrollment,
  onDone,
}: {
  studentId: string;
  enrollment: EnrollmentLite;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [day, setDay] = useState("1");
  const [time, setTime] = useState("16:00");
  const [dur, setDur] = useState(String(enrollment.defaultDuration));
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    const d = Number(dur);
    if (!Number.isInteger(d) || d <= 0) return setError("Enter a valid duration.");
    startTransition(async () => {
      const res = await createRecurringSlot({
        enrollmentId: enrollment.id,
        studentId,
        dayOfWeek: Number(day),
        startTime: time,
        durationMin: d,
      });
      if (res.ok) onDone();
      else setError(res.error ?? "Something went wrong.");
    });
  }

  return (
    <div className="mt-1 flex flex-wrap items-end gap-2 border border-gray-300 p-2">
      {error && <div className="banner banner-error w-full">{error}</div>}
      <div>
        <label className="label">Day</label>
        <select className="input" value={day} onChange={(e) => setDay(e.target.value)}>
          {DAY_NAMES.map((n, i) => (
            <option key={i} value={i}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Start time</label>
        <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <div>
        <label className="label">Duration (min)</label>
        <input className="input w-24" inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value)} />
      </div>
      <button className="btn btn-primary" disabled={pending} onClick={save}>
        Save slot
      </button>
      <button className="btn" onClick={onDone}>
        Cancel
      </button>
    </div>
  );
}

function DeleteSlotDialog({
  slot,
  studentId,
  onClose,
}: {
  slot: SlotRow;
  studentId: string;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  function run(deleteFuture: boolean) {
    startTransition(async () => {
      await deleteRecurringSlot({ scheduleId: slot.id, studentId, deleteFuture });
      onClose();
    });
  }
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md border border-gray-400 bg-white p-4">
        <h3 className="mb-2 font-semibold">Delete recurring slot</h3>
        <p className="mb-3 text-sm">
          Delete future generated lessons that are not completed and not on any
          bill? ({slot.futureCount} lessons)
        </p>
        <div className="flex flex-col gap-2">
          <button className="btn btn-danger" disabled={pending} onClick={() => run(true)}>
            Delete them
          </button>
          <button className="btn" disabled={pending} onClick={() => run(false)}>
            Keep them as one-off lessons
          </button>
          <button className="btn" disabled={pending} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RecurringSection({
  studentId,
  enrollments,
  slots,
}: {
  studentId: string;
  enrollments: EnrollmentLite[];
  slots: SlotRow[];
}) {
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SlotRow | null>(null);

  if (enrollments.length === 0) return null;

  return (
    <div className="space-y-3">
      {enrollments.map((e) => {
        const eSlots = slots.filter((s) => s.enrollmentId === e.id);
        return (
          <div key={e.id} className="card">
            <div className="mb-1 font-medium">{e.label}</div>
            {eSlots.length === 0 ? (
              <p className="text-sm text-gray-500">No recurring slots.</p>
            ) : (
              <ul className="text-sm">
                {eSlots.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-0.5">
                    <span>
                      {DAY_NAMES[s.dayOfWeek]} {s.startTime.slice(0, 5)} · {s.durationMin} min
                    </span>
                    <button className="btn btn-danger" onClick={() => setDeleteTarget(s)}>
                      Delete slot
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {addingFor === e.id ? (
              <AddSlotForm studentId={studentId} enrollment={e} onDone={() => setAddingFor(null)} />
            ) : (
              <button className="btn mt-2" onClick={() => setAddingFor(e.id)}>
                + Recurring slot
              </button>
            )}
          </div>
        );
      })}

      {deleteTarget && (
        <DeleteSlotDialog slot={deleteTarget} studentId={studentId} onClose={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}
