"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createStudent } from "./actions";
import { emptyFormState } from "@/lib/forms";
import type { TeachingMode } from "@/lib/database.types";

export type PayerOption = { id: string; name: string };

const MODE_OPTIONS: { value: TeachingMode; label: string }[] = [
  { value: "STUDENT_HOME", label: "Student's home" },
  { value: "TUTOR_HOME", label: "My home" },
  { value: "ONLINE", label: "Online" },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Saving…" : "Save student"}
    </button>
  );
}

export default function NewStudentForm({ payers }: { payers: PayerOption[] }) {
  const [state, formAction] = useFormState(createStudent, emptyFormState);

  const [payerMode, setPayerMode] = useState<"existing" | "new">(
    payers.length > 0 ? "existing" : "new",
  );
  const [payerId, setPayerId] = useState("");
  const [payerSearch, setPayerSearch] = useState("");
  const [confirmDup, setConfirmDup] = useState(false);
  const [duration, setDuration] = useState("");

  const filteredPayers = useMemo(() => {
    const n = payerSearch.trim().toLowerCase();
    if (!n) return payers;
    return payers.filter((p) => p.name.toLowerCase().includes(n));
  }, [payers, payerSearch]);

  const selectedPayerName = payers.find((p) => p.id === payerId)?.name;

  return (
    <form action={formAction} className="max-w-2xl space-y-5">
      {state.error && <div className="banner banner-error">{state.error}</div>}
      {state.warning && (
        <div className="banner banner-warn">
          <p>{state.warning}</p>
          <label className="mt-1 block">
            <input
              type="checkbox"
              className="mr-1"
              checked={confirmDup}
              onChange={(e) => setConfirmDup(e.target.checked)}
            />
            Yes, add anyway.
          </label>
        </div>
      )}

      {/* Hidden fields carrying picker state to the server action */}
      <input type="hidden" name="payer_mode" value={payerMode} />
      <input type="hidden" name="payer_id" value={payerId} />
      <input type="hidden" name="confirm_duplicate" value={confirmDup ? "1" : "0"} />

      {/* Payer */}
      <fieldset className="card">
        <legend className="px-1 text-sm font-semibold">Payer</legend>
        <div className="mb-2 flex gap-4 text-sm">
          <label>
            <input
              type="radio"
              className="mr-1"
              checked={payerMode === "existing"}
              onChange={() => setPayerMode("existing")}
              disabled={payers.length === 0}
            />
            Existing payer
          </label>
          <label>
            <input
              type="radio"
              className="mr-1"
              checked={payerMode === "new"}
              onChange={() => setPayerMode("new")}
            />
            ＋ New payer
          </label>
        </div>

        {payerMode === "existing" ? (
          <div>
            <input
              className="input max-w-sm"
              placeholder="Search payers…"
              value={payerSearch}
              onChange={(e) => setPayerSearch(e.target.value)}
            />
            <div className="mt-2 max-h-40 overflow-auto border border-gray-200">
              {filteredPayers.length === 0 ? (
                <div className="p-2 text-xs text-gray-500">No payers found.</div>
              ) : (
                filteredPayers.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => setPayerId(p.id)}
                    className={`block w-full px-2 py-1 text-left text-sm hover:bg-gray-100 ${
                      p.id === payerId ? "bg-blue-100 font-semibold" : ""
                    }`}
                  >
                    {p.name}
                  </button>
                ))
              )}
            </div>
            {selectedPayerName && (
              <p className="mt-1 text-sm">
                Selected: <strong>{selectedPayerName}</strong>
              </p>
            )}
            {state.fieldErrors?.payer_id && (
              <p className="field-error">{state.fieldErrors.payer_id}</p>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Payer name</label>
              <input name="new_payer_name" className="input" />
              {state.fieldErrors?.new_payer_name && (
                <p className="field-error">{state.fieldErrors.new_payer_name}</p>
              )}
            </div>
            <div>
              <label className="label">Phone</label>
              <input name="new_payer_phone" className="input" inputMode="tel" />
            </div>
            <div>
              <label className="label">Billing cycle</label>
              <select name="new_payer_cycle" className="input" defaultValue="MONTHLY">
                <option value="MONTHLY">Monthly</option>
                <option value="PER_LESSON">Per lesson</option>
              </select>
            </div>
            <div>
              <label className="label">Billing basis</label>
              <select name="new_payer_basis" className="input" defaultValue="SCHEDULED">
                <option value="SCHEDULED">Scheduled (bill upfront)</option>
                <option value="COMPLETED">Completed (bill in arrears)</option>
              </select>
            </div>
          </div>
        )}
      </fieldset>

      {/* Student */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Name</label>
          <input name="name" className="input" />
          {state.fieldErrors?.name && (
            <p className="field-error">{state.fieldErrors.name}</p>
          )}
        </div>
        <div>
          <label className="label">School</label>
          <input name="school" className="input" />
        </div>
      </div>

      <div>
        <label className="label">Address</label>
        <input name="address" className="input" />
      </div>

      <div>
        <span className="label">Default mode</span>
        <div className="flex flex-wrap gap-4 text-sm">
          {MODE_OPTIONS.map((m, i) => (
            <label key={m.value}>
              <input
                type="radio"
                name="default_mode"
                value={m.value}
                className="mr-1"
                defaultChecked={i === 0}
              />
              {m.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Notes</label>
        <textarea name="notes" className="input" rows={3} />
      </div>

      {/* First subject (optional) — creates an enrolment so you can schedule
          lessons right away. */}
      <fieldset className="card">
        <legend className="px-1 text-sm font-semibold">
          First subject{" "}
          <span className="font-normal text-ink-soft">
            — optional, but lets you schedule lessons immediately
          </span>
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Subject</label>
            <input name="subject" className="input" placeholder="e.g. Science" />
            {state.fieldErrors?.subject && (
              <p className="field-error">{state.fieldErrors.subject}</p>
            )}
          </div>
          <div>
            <label className="label">Level</label>
            <input name="level" className="input" placeholder="e.g. Sec 2 G3" />
            {state.fieldErrors?.level && (
              <p className="field-error">{state.fieldErrors.level}</p>
            )}
          </div>
          <div>
            <label className="label">Hourly rate ($)</label>
            <input name="rate" className="input" inputMode="decimal" placeholder="e.g. 50" />
            {state.fieldErrors?.rate && (
              <p className="field-error">{state.fieldErrors.rate}</p>
            )}
          </div>
          <div>
            <label className="label">Duration (minutes)</label>
            <div className="mb-1 flex gap-1">
              {[60, 90, 120].map((d) => (
                <button
                  type="button"
                  key={d}
                  className={`chip ${Number(duration) === d ? "bg-accent-soft text-accent-dark" : ""}`}
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
              placeholder="e.g. 90"
            />
            {state.fieldErrors?.duration_min && (
              <p className="field-error">{state.fieldErrors.duration_min}</p>
            )}
          </div>
        </div>
      </fieldset>

      <SubmitButton />
    </form>
  );
}
