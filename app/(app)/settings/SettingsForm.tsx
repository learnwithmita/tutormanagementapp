"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { saveSettings } from "./actions";
import { emptyFormState } from "@/lib/forms";
import {
  DEFAULT_BILL_TEMPLATE,
  DEFAULT_RECEIPT_TEMPLATE,
  PLACEHOLDER_LEGEND,
} from "@/lib/templates";
import type { Tutor } from "@/lib/database.types";

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}

function Legend() {
  return (
    <div className="mt-2 border border-gray-200 bg-gray-50 p-2 text-xs">
      <div className="mb-1 font-semibold">Placeholders</div>
      <ul className="space-y-0.5">
        {PLACEHOLDER_LEGEND.map((p) => (
          <li key={p.token}>
            <code className="bg-white px-1">{p.token}</code> — {p.outputs}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SettingsForm({ tutor }: { tutor: Tutor }) {
  const [state, formAction] = useFormState(saveSettings, emptyFormState);

  const [bill, setBill] = useState(tutor.bill_template);
  const [receipt, setReceipt] = useState(tutor.receipt_template);
  const [confirmUnknown, setConfirmUnknown] = useState(false);

  function resetBill() {
    if (confirm("Reset the bill template to the default? Your current bill template text will be replaced. You'll still need to press Save.")) {
      setBill(DEFAULT_BILL_TEMPLATE);
    }
  }
  function resetReceipt() {
    if (confirm("Reset the receipt template to the default? Your current receipt template text will be replaced. You'll still need to press Save.")) {
      setReceipt(DEFAULT_RECEIPT_TEMPLATE);
    }
  }

  return (
    <form action={formAction} className="max-w-3xl space-y-5">
      {state.error && <div className="banner banner-error">{state.error}</div>}
      {state.message && (
        <div className="banner banner-success">{state.message}</div>
      )}
      {state.warning && (
        <div className="banner banner-warn">
          <p>{state.warning}</p>
          <label className="mt-1 block">
            <input
              type="checkbox"
              className="mr-1"
              checked={confirmUnknown}
              onChange={(e) => setConfirmUnknown(e.target.checked)}
            />
            Yes, save with the literal placeholder(s).
          </label>
        </div>
      )}

      {/* confirm_unknown travels with the next submit */}
      <input
        type="hidden"
        name="confirm_unknown"
        value={confirmUnknown ? "1" : "0"}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            name="name"
            className="input"
            defaultValue={tutor.name ?? ""}
          />
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
            defaultValue={tutor.paynow_number ?? ""}
          />
          {state.fieldErrors?.paynow_number && (
            <p className="field-error">{state.fieldErrors.paynow_number}</p>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="label" htmlFor="bill_template">
            Bill template
          </label>
          <button type="button" className="btn" onClick={resetBill}>
            Reset to default
          </button>
        </div>
        <textarea
          id="bill_template"
          name="bill_template"
          className="input font-mono"
          rows={9}
          value={bill}
          onChange={(e) => setBill(e.target.value)}
        />
        <p className="mt-1 text-xs text-gray-600">
          Uniform-rate bills render the single{" "}
          <code>Total {"{total_hours}"} hours x ${"{rate}"} = ${"{total}"}</code>{" "}
          line. Mixed-rate bills (or bills with an adjustment) replace that line
          with an itemised block automatically.
        </p>
        <Legend />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="label" htmlFor="receipt_template">
            Receipt template
          </label>
          <button type="button" className="btn" onClick={resetReceipt}>
            Reset to default
          </button>
        </div>
        <textarea
          id="receipt_template"
          name="receipt_template"
          className="input font-mono"
          rows={7}
          value={receipt}
          onChange={(e) => setReceipt(e.target.value)}
        />
        <Legend />
      </div>

      <SaveButton label="Save" />
    </form>
  );
}
