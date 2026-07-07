"use client";

import { useFormState, useFormStatus } from "react-dom";
import { completeSetup } from "./actions";
import { emptyFormState } from "@/lib/forms";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={pending}>
      {pending ? "Saving…" : "Save & continue"}
    </button>
  );
}

export default function SetupPage() {
  const [state, formAction] = useFormState(completeSetup, emptyFormState);

  return (
    <div className="mx-auto mt-16 max-w-md px-4">
      <h1 className="mb-1 text-xl font-semibold">Welcome — quick setup</h1>
      <p className="mb-4 text-sm text-gray-600">
        Tell us who you are. You can change these later in Settings.
      </p>
      {state.error && (
        <div className="banner banner-error mb-3">{state.error}</div>
      )}
      <form action={formAction} className="space-y-3">
        <div>
          <label className="label" htmlFor="name">
            Name
          </label>
          <input id="name" name="name" className="input" required />
          {state.fieldErrors?.name && (
            <p className="field-error">{state.fieldErrors.name}</p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="paynow_number">
            PayNow number
          </label>
          <input
            id="paynow_number"
            name="paynow_number"
            className="input"
            inputMode="numeric"
            placeholder="8 or 9 followed by 7 digits"
          />
          {state.fieldErrors?.paynow_number && (
            <p className="field-error">{state.fieldErrors.paynow_number}</p>
          )}
        </div>
        <SubmitButton />
      </form>
    </div>
  );
}
