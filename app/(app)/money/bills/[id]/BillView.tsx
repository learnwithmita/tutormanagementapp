"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  markBillSent,
  saveDraftMessage,
  deleteDraft,
  voidBill,
  voidAndRegenerate,
  createAdjustment,
} from "@/app/(app)/money/actions";
import { formatMoney, parseDollarsToCents } from "@/lib/money";
import { formatDate } from "@/lib/format";
import LessonStatusBadge from "@/components/LessonStatusBadge";
import type { LessonStatus, BillStatus, PaymentMethod } from "@/lib/database.types";
import RecordPaymentButton from "./RecordPaymentButton";
import ReceiptPanel from "./ReceiptPanel";

export type BillViewData = {
  id: string;
  payerId: string;
  payerName: string;
  periodLabel: string;
  status: BillStatus;
  messageText: string;
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
  lessons: {
    id: string;
    when: string;
    status: LessonStatus;
    studentName: string;
    level: string;
    subject: string;
    startsAt: string;
    durationMin: number;
    rateCents: number;
  }[];
  payments: {
    id: string;
    paidAt: string;
    amountCents: number;
    method: PaymentMethod;
    note: string | null;
  }[];
  adjustments: { reason: string; amountCents: number }[];
  receipt: { receiptNo: string; status: string; messageText: string | null } | null;
  paynowNumber: string;
  receiptTemplate: string;
};

export default function BillView({ data }: { data: BillViewData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const textRef = useRef<HTMLTextAreaElement>(null);

  const [msg, setMsg] = useState(data.messageText);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFallback, setCopyFallback] = useState(false);
  const [adjOpen, setAdjOpen] = useState(false);

  const isDraft = data.status === "DRAFT";
  const isVoid = data.status === "VOID";
  const isFrozen = data.status === "SENT" || data.status === "PARTIALLY_PAID" || data.status === "PAID";

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
    });
  }

  async function copy() {
    setError(null);
    try {
      await navigator.clipboard.writeText(isDraft ? msg : data.messageText);
      setCopied(true);
      setCopyFallback(false);
    } catch {
      textRef.current?.select();
      setCopyFallback(true);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">
          Bill — {data.periodLabel}{" "}
          <span className="chip ml-1">{data.status}</span>
        </h1>
        <p className="text-sm">
          Payer:{" "}
          <Link href={`/money/payers/${data.payerId}`} className="underline">
            {data.payerName}
          </Link>
        </p>
      </div>

      {error && <div className="banner banner-error">{error}</div>}
      {isVoid && (
        <div className="banner banner-warn">
          This bill is void. Its lessons are free to be billed again.
        </div>
      )}

      {/* Totals */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Total" value={formatMoney(data.totalCents)} />
        <Stat label="Paid" value={formatMoney(data.paidCents)} />
        <Stat label="Outstanding" value={formatMoney(data.outstandingCents)} red={data.outstandingCents > 0} />
      </div>

      {/* Message */}
      <div>
        <label className="label">Message {isFrozen && "(sent — read only)"}</label>
        <textarea
          ref={textRef}
          className="input font-mono"
          rows={12}
          value={isDraft ? msg : data.messageText}
          readOnly={!isDraft}
          onChange={(e) => { setMsg(e.target.value); setCopied(false); }}
        />
      </div>

      {copyFallback && (
        <div className="banner banner-warn">
          Couldn’t copy automatically. The text is selected — press Ctrl/Cmd+C.
        </div>
      )}
      {copied && isDraft && (
        <div className="banner banner-success flex items-center justify-between">
          <span>Copied.</span>
          <button className="btn btn-primary" disabled={pending} onClick={() => run(() => markBillSent(data.id, msg))}>
            Mark as sent
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={pending} onClick={copy}>
          Copy to clipboard
        </button>

        {isDraft && (
          <>
            <button className="btn" disabled={pending} onClick={() => run(() => saveDraftMessage(data.id, msg))}>
              Save draft
            </button>
            <button className="btn btn-primary" disabled={pending} onClick={() => run(() => markBillSent(data.id, msg))}>
              Mark as sent
            </button>
            <button
              className="btn btn-danger"
              disabled={pending}
              onClick={() => {
                if (confirm("Delete this draft bill? Its lessons return to unbilled.")) {
                  run(() => deleteDraft(data.id));
                }
              }}
            >
              Delete draft
            </button>
          </>
        )}

        {isFrozen && (
          <>
            <RecordPaymentButton
              billId={data.id}
              payerId={data.payerId}
              outstandingCents={data.outstandingCents}
            />
            <button
              className="btn"
              disabled={pending}
              onClick={() => {
                if (confirm("Void this bill and start a fresh draft with the same lessons?")) {
                  run(() => voidAndRegenerate(data.id));
                }
              }}
            >
              Void &amp; regenerate
            </button>
            <button
              className="btn btn-danger"
              disabled={pending}
              onClick={() => {
                if (confirm("Void this bill? Its lessons can be billed again.")) {
                  run(() => voidBill(data.id));
                }
              }}
            >
              Void bill
            </button>
            <button className="btn" onClick={() => setAdjOpen((v) => !v)}>
              Adjust next bill
            </button>
          </>
        )}
      </div>

      {adjOpen && isFrozen && (
        <AdjustForm
          payerId={data.payerId}
          onDone={() => { setAdjOpen(false); router.refresh(); }}
        />
      )}

      {/* Receipt (PAID) */}
      {data.status === "PAID" && (
        <ReceiptPanel
          billId={data.id}
          receipt={data.receipt}
          template={data.receiptTemplate}
          context={{
            payerName: data.payerName,
            month: data.periodLabel,
            paynowNumber: data.paynowNumber,
            totalCents: data.totalCents,
            paidDate: data.payments.length
              ? formatDate(data.payments[data.payments.length - 1]!.paidAt)
              : formatDate(new Date().toISOString()),
            lessons: data.lessons,
          }}
        />
      )}

      {/* Payments */}
      <section>
        <h2 className="mb-1 font-semibold">Payments</h2>
        {data.payments.length === 0 ? (
          <p className="text-sm text-gray-600">No payments recorded.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Method</th>
                <th>Note</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.payments.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.paidAt)}</td>
                  <td>{p.method}</td>
                  <td className="text-xs text-gray-600">{p.note}</td>
                  <td className="text-right">{formatMoney(p.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Lessons */}
      <section>
        <h2 className="mb-1 font-semibold">Lessons on this bill</h2>
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Student</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.lessons.map((l) => (
              <tr key={l.id}>
                <td>{l.when}</td>
                <td>{l.studentName} <span className="text-xs text-gray-500">· {l.level} {l.subject}</span></td>
                <td><LessonStatusBadge status={l.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Applied adjustments */}
      {data.adjustments.length > 0 && (
        <section>
          <h2 className="mb-1 font-semibold">Adjustments on this bill</h2>
          <ul className="text-sm">
            {data.adjustments.map((a, i) => (
              <li key={i}>
                {a.amountCents >= 0 ? "Credit" : "Charge"} — {a.reason}:{" "}
                {formatMoney(-a.amountCents)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, red }: { label: string; value: string; red?: boolean }) {
  return (
    <div className="card">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-semibold ${red ? "text-red-700" : ""}`}>{value}</div>
    </div>
  );
}

function AdjustForm({ payerId, onDone }: { payerId: string; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<"credit" | "charge">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    const cents = parseDollarsToCents(amount);
    if (cents == null || cents <= 0) return setError("Enter a valid amount.");
    if (!reason.trim()) return setError("A reason is required.");
    const signed = kind === "credit" ? cents : -cents;
    startTransition(async () => {
      const res = await createAdjustment({ payerId, amountCents: signed, reason });
      if (res.ok) onDone();
      else setError(res.error ?? "Something went wrong.");
    });
  }

  return (
    <div className="card space-y-2">
      <p className="text-sm text-gray-600">
        This records a pending {kind} that appears on the payer’s next bill.
      </p>
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
        <button className="btn btn-primary" disabled={pending} onClick={save}>
          Save
        </button>
        <button className="btn" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}
