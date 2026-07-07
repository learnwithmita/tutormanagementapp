"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  saveEnrollment,
  archiveEnrollment,
  unarchiveEnrollment,
} from "./actions";
import { emptyFormState } from "@/lib/forms";
import { formatMoney, centsToInput } from "@/lib/money";

export type EnrollmentRow = {
  id: string;
  subject: string;
  level: string;
  rateCents: number;
  durationMin: number;
  archived: boolean;
  futureScheduled: number;
};

const DURATION_CHIPS = [60, 90, 120];

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}

function EnrollmentForm({
  studentId,
  row,
  onDone,
}: {
  studentId: string;
  row?: EnrollmentRow;
  onDone: () => void;
}) {
  const [state, formAction] = useFormState(saveEnrollment, emptyFormState);
  const [duration, setDuration] = useState(String(row?.durationMin ?? 60));

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="card space-y-3">
      <input type="hidden" name="student_id" value={studentId} />
      {row && <input type="hidden" name="enrollment_id" value={row.id} />}
      {state.error && <div className="banner banner-error">{state.error}</div>}

      <p className="banner banner-info text-xs">
        Changing the default rate affects future lessons only. Existing lessons
        keep the rate they were created with.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Subject</label>
          <input name="subject" className="input" defaultValue={row?.subject ?? ""} />
          {state.fieldErrors?.subject && (
            <p className="field-error">{state.fieldErrors.subject}</p>
          )}
        </div>
        <div>
          <label className="label">Level</label>
          <input name="level" className="input" defaultValue={row?.level ?? ""} />
          {state.fieldErrors?.level && (
            <p className="field-error">{state.fieldErrors.level}</p>
          )}
        </div>
        <div>
          <label className="label">Default hourly rate ($)</label>
          <input
            name="rate"
            className="input"
            inputMode="decimal"
            defaultValue={row ? centsToInput(row.rateCents) : ""}
          />
          {state.fieldErrors?.rate && (
            <p className="field-error">{state.fieldErrors.rate}</p>
          )}
        </div>
        <div>
          <label className="label">Default duration (minutes)</label>
          <div className="mb-1 flex gap-1">
            {DURATION_CHIPS.map((d) => (
              <button
                type="button"
                key={d}
                className={`chip ${
                  Number(duration) === d ? "bg-blue-100 font-semibold" : ""
                }`}
                onClick={() => setDuration(String(d))}
              >
                {d}
              </button>
            ))}
          </div>
          <input
            name="duration_min"
            className="input"
            inputMode="numeric"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
          {state.fieldErrors?.duration_min && (
            <p className="field-error">{state.fieldErrors.duration_min}</p>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <SaveButton label={row ? "Save enrolment" : "Add enrolment"} />
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ArchiveDialog({
  row,
  studentId,
  onClose,
}: {
  row: EnrollmentRow;
  studentId: string;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function run(choice: "cancel_free" | "keep") {
    startTransition(async () => {
      await archiveEnrollment(row.id, studentId, choice);
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md border border-gray-400 bg-white p-4">
        <h3 className="mb-2 font-semibold">
          Archive {row.level} {row.subject}
        </h3>
        {row.futureScheduled > 0 ? (
          <>
            <p className="mb-3 text-sm">
              There are <strong>{row.futureScheduled}</strong> upcoming lessons.
            </p>
            <div className="flex flex-col gap-2">
              <button
                className="btn btn-danger"
                disabled={pending}
                onClick={() => run("cancel_free")}
              >
                Cancel them (free) &amp; archive
              </button>
              <button className="btn" disabled={pending} onClick={() => run("keep")}>
                Keep them &amp; archive
              </button>
              <button className="btn" disabled={pending} onClick={onClose}>
                Abort
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-3 text-sm">
              Archive this enrolment? History stays attached.
            </p>
            <div className="flex gap-2">
              <button
                className="btn btn-danger"
                disabled={pending}
                onClick={() => run("keep")}
              >
                Archive
              </button>
              <button className="btn" disabled={pending} onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function EnrollmentsSection({
  studentId,
  rows,
}: {
  studentId: string;
  rows: EnrollmentRow[];
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<EnrollmentRow | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-sm text-gray-600">No enrolments yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Subject</th>
              <th>Level</th>
              <th className="text-right">Rate</th>
              <th className="text-right">Duration</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) =>
              editingId === r.id ? (
                <tr key={r.id}>
                  <td colSpan={6}>
                    <EnrollmentForm
                      studentId={studentId}
                      row={r}
                      onDone={() => setEditingId(null)}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={r.id} className={r.archived ? "opacity-60" : ""}>
                  <td>{r.subject}</td>
                  <td>{r.level}</td>
                  <td className="text-right">{formatMoney(r.rateCents)}/h</td>
                  <td className="text-right">{r.durationMin} min</td>
                  <td>{r.archived ? "Archived" : "Active"}</td>
                  <td className="text-right">
                    {r.archived ? (
                      <button
                        className="btn"
                        disabled={pending}
                        onClick={() =>
                          startTransition(() =>
                            unarchiveEnrollment(r.id, studentId),
                          )
                        }
                      >
                        Unarchive
                      </button>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <button className="btn" onClick={() => setEditingId(r.id)}>
                          Edit
                        </button>
                        <button
                          className="btn btn-danger"
                          onClick={() => setArchiveTarget(r)}
                        >
                          Archive
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}

      {adding ? (
        <EnrollmentForm studentId={studentId} onDone={() => setAdding(false)} />
      ) : (
        <button className="btn" onClick={() => setAdding(true)}>
          + Add enrolment
        </button>
      )}

      {archiveTarget && (
        <ArchiveDialog
          row={archiveTarget}
          studentId={studentId}
          onClose={() => setArchiveTarget(null)}
        />
      )}
    </div>
  );
}
