"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordPayment } from "@/app/(app)/money/payment-actions";
import { centsToInput, parseDollarsToCents, formatMoney } from "@/lib/money";
import { todaySGT } from "@/lib/format";
import type { PaymentMethod } from "@/lib/database.types";

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "PAYNOW", label: "PayNow" },
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "OTHER", label: "Other" },
];

export default function RecordPaymentButton({
  billId,
  payerId,
  outstandingCents,
}: {
  billId: string | null;
  payerId: string;
  outstandingCents: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [amount, setAmount] = useState(
    outstandingCents > 0 ? centsToInput(outstandingCents) : "",
  );
  const [date, setDate] = useState(todaySGT());
  const [method, setMethod] = useState<PaymentMethod>("PAYNOW");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [excess, setExcess] = useState<{ outstandingCents: number; excessCents: number } | null>(null);

  const futureDate = date > todaySGT();

  function submit(confirmExcess: boolean) {
    setError(null);
    const cents = parseDollarsToCents(amount);
    if (cents == null || cents <= 0) return setError("Enter an amount greater than $0.");
    startTransition(async () => {
      const res = await recordPayment({
        payerId,
        billId,
        amountCents: cents,
        paidAt: date,
        method,
        note,
        confirmExcess,
      });
      if (res.ok) {
        setOpen(false);
        setExcess(null);
        router.refresh();
      } else if (res.excess) {
        setExcess(res.excess);
      } else {
        setError(res.error ?? "Something went wrong.");
      }
    });
  }

  if (!open) {
    return (
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        Record payment
      </button>
    );
  }

  return (
    <div className="card w-full space-y-2">
      <h3 className="font-semibold">Record payment</h3>
      {error && <div className="banner banner-error">{error}</div>}
      {excess && (
        <div className="banner banner-warn">
          <p>
            This exceeds the outstanding {formatMoney(excess.outstandingCents)} by{" "}
            {formatMoney(excess.excessCents)}. Record the excess as a credit on the
            payer’s account?
          </p>
          <div className="mt-1 flex gap-2">
            <button className="btn btn-primary" disabled={pending} onClick={() => submit(true)}>
              Yes, credit the excess
            </button>
            <button className="btn" onClick={() => setExcess(null)}>
              Edit amount
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label">Amount ($)</label>
          <input className="input w-28" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <label className="label">Date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Method</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="grow">
          <label className="label">Note</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      {futureDate && (
        <p className="text-xs text-yellow-800">Heads up: this date is in the future.</p>
      )}
      {!excess && (
        <div className="flex gap-2">
          <button className="btn btn-primary" disabled={pending} onClick={() => submit(false)}>
            Save payment
          </button>
          <button className="btn" onClick={() => { setOpen(false); setError(null); }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
