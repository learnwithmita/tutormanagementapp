"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { updateStudent, setStudentArchived } from "./actions";
import { emptyFormState } from "@/lib/forms";
import { formatMoney } from "@/lib/money";
import { MODE_LABELS, mapsUrl } from "@/lib/format";
import type { TeachingMode } from "@/lib/database.types";

type Student = {
  id: string;
  name: string;
  school: string | null;
  address: string | null;
  notes: string | null;
  mode: TeachingMode;
  archived: boolean;
};

const MODE_OPTIONS: { value: TeachingMode; label: string }[] = [
  { value: "STUDENT_HOME", label: "Student's home" },
  { value: "TUTOR_HOME", label: "My home" },
  { value: "ONLINE", label: "Online" },
];

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

export default function StudentHeader({
  student,
  payer,
  payerBalanceCents,
}: {
  student: Student;
  payer: { id: string; name: string };
  payerBalanceCents: number;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useFormState(updateStudent, emptyFormState);
  const [pending, startTransition] = useTransition();

  // Close the editor after a successful save.
  useEffect(() => {
    if (state.ok) setEditing(false);
  }, [state.ok]);

  function onArchive() {
    let msg =
      "Archive keeps all history and hides the student from pickers. Continue?";
    if (payerBalanceCents > 0) {
      msg += `\n\nThis student's payer still owes ${formatMoney(
        payerBalanceCents,
      )}.`;
    }
    if (confirm(msg)) {
      startTransition(() => setStudentArchived(student.id, true));
    }
  }
  function onUnarchive() {
    startTransition(() => setStudentArchived(student.id, false));
  }

  if (editing) {
    return (
      <form action={formAction} className="card space-y-3">
        <input type="hidden" name="student_id" value={student.id} />
        {state.error && <div className="banner banner-error">{state.error}</div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Name</label>
            <input name="name" className="input" defaultValue={student.name} />
            {state.fieldErrors?.name && (
              <p className="field-error">{state.fieldErrors.name}</p>
            )}
          </div>
          <div>
            <label className="label">School</label>
            <input name="school" className="input" defaultValue={student.school ?? ""} />
          </div>
        </div>
        <div>
          <label className="label">Address</label>
          <input name="address" className="input" defaultValue={student.address ?? ""} />
        </div>
        <div>
          <span className="label">Default mode</span>
          <div className="flex flex-wrap gap-4 text-sm">
            {MODE_OPTIONS.map((m) => (
              <label key={m.value}>
                <input
                  type="radio"
                  name="default_mode"
                  value={m.value}
                  className="mr-1"
                  defaultChecked={student.mode === m.value}
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea name="notes" className="input" rows={3} defaultValue={student.notes ?? ""} />
        </div>
        <div className="flex gap-2">
          <SaveButton />
          <button type="button" className="btn" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="card">
      {student.archived && (
        <div className="banner banner-warn mb-2 flex items-center justify-between">
          <span>Archived</span>
          <button className="btn" onClick={onUnarchive} disabled={pending}>
            Unarchive
          </button>
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{student.name}</h1>
          <div className="mt-1 text-sm text-gray-700">
            {student.school && <span>{student.school} · </span>}
            <span>{MODE_LABELS[student.mode]}</span>
          </div>
          <div className="mt-1 text-sm">
            Payer:{" "}
            <Link href={`/money/payers/${payer.id}`} className="underline">
              {payer.name}
            </Link>
            {payerBalanceCents > 0 && (
              <span className="ml-2 font-semibold text-red-700">
                owes {formatMoney(payerBalanceCents)}
              </span>
            )}
          </div>
          {student.address && (
            <div className="mt-1 text-sm">
              {student.address}{" "}
              <a
                href={mapsUrl(student.address)}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Open in Maps
              </a>
            </div>
          )}
          {student.notes && (
            <div className="mt-2 whitespace-pre-wrap text-sm text-gray-600">
              {student.notes}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <button className="btn" onClick={() => setEditing(true)}>
            Edit
          </button>
          {!student.archived && (
            <button className="btn btn-danger" onClick={onArchive} disabled={pending}>
              Archive
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
