"use client";

import Link from "next/link";
import { formatMoney } from "@/lib/money";
import type { FrozenBill } from "@/app/(app)/lessons/actions";

// The frozen-bill blocking dialog. The "Void & regenerate" and "Adjust next
// bill" actions live on the bill screen (Milestone 5); from a lesson we explain
// the rule and link there. "Cancel" makes no change.
export default function FrozenBillDialog({
  frozen,
  payerName,
  onClose,
}: {
  frozen: FrozenBill;
  payerName?: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md border border-gray-400 bg-white p-4">
        <h3 className="mb-2 font-semibold text-red-700">Lesson is on a sent bill</h3>
        <p className="mb-3 text-sm">
          This lesson is on bill <strong>{frozen.label}</strong> ({frozen.status},{" "}
          {formatMoney(frozen.totalCents)})
          {payerName ? ` that was already sent to ${payerName}.` : " that was already sent."}
          {" "}Choose:
        </p>
        <ol className="mb-3 list-decimal space-y-2 pl-5 text-sm">
          <li>
            <strong>Void &amp; regenerate</strong> — void that bill, make your
            change, and create a fresh draft to re-send.
          </li>
          <li>
            <strong>Adjust next bill</strong> — keep the sent bill as-is; record a
            credit/charge that appears on the payer's next bill.
          </li>
          <li>
            <strong>Cancel</strong> — make no change.
          </li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <Link href={`/money/bills/${frozen.billId}`} className="btn btn-primary">
            Open the bill
          </Link>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
