"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createAdjustment } from "@/app/(app)/money/actions";
import RecordPaymentButton from "@/app/(app)/money/bills/[id]/RecordPaymentButton";
import { parseDollarsToCents } from "@/lib/money";

export default function PayerLedgerActions({
  payerId,
  month,
}: {
  payerId: string;
  month: string;
}) {
  const router = useRouter();
  const [adjOpen, setAdjOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<"credit" | "charge">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function saveAdj() {
    setError(null);
    const cents = parseDollarsToCents(amount);
    if (cents == null || cents <= 0) return setError("Enter a valid amount.");
    if (!reason.trim()) return setError("A reason is required.");
    const signed = kind === "credit" ? cents : -cents;
    startTransition(async () => {
      const res = await createAdjustment({ payerId, amountCents: signed, reason });
      if (res.ok) {
        setAdjOpen(false);
        setAmount("");
        setReason("");
        router.refresh();
      } else setError(res.error ?? "Something went wrong.");
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Link href={`/money/bills/new?payer=${payerId}&m=${month}`} className="btn btn-primary">
          Generate bill
        </Link>
        <RecordPaymentButton billId={null} payerId={payerId} outstandingCents={0} />
        <button className="btn" onClick={() => setAdjOpen((v) => !v)}>
          Add adjustment
        </button>
      </div>

      {adjOpen && (
        <div className="card space-y-2">
          {error && <div className="banner banner-error">{error}</div>}
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="label">Type</label>
              <select className="input" value={kind} onChange={(e) => setKind(e.target.value as any)}>
                <option value="credit">Credit (to payer)</option>
                <option value="charge">Charge (extra)</option>
              </select>
            </div>
            <div>
              <label className="label">Amount ($)</label>
              <input className="input w-28" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="grow">
              <label className="label">Reason</label>
              <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <button className="btn btn-primary" disabled={pending} onClick={saveAdj}>
              Save
            </button>
            <button className="btn" onClick={() => setAdjOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
