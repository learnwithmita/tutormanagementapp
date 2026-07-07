"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDraftBill, markBillSent } from "@/app/(app)/money/actions";
import {
  renderTemplate,
  computeBillNumbers,
  type BillRenderContext,
  type RenderGroup,
} from "@/lib/render";
import { formatLessonRange } from "@/lib/format";
import { formatMoney, lessonAmountCents } from "@/lib/money";
import LessonStatusBadge from "@/components/LessonStatusBadge";
import type { LessonStatus } from "@/lib/database.types";

export type Candidate = {
  id: string;
  startsAt: string;
  durationMin: number;
  rateCents: number;
  status: LessonStatus;
  studentName: string;
  level: string;
  subject: string;
};
export type PendingAdjustment = { id: string; reason: string; amountCents: number };

export default function GenerateBillForm({
  payer,
  paynowNumber,
  template,
  defaultLabel,
  defaultStart,
  defaultEnd,
  candidates,
  adjustments,
}: {
  payer: { id: string; name: string };
  paynowNumber: string;
  template: string;
  defaultLabel: string;
  defaultStart: string;
  defaultEnd: string;
  candidates: Candidate[];
  adjustments: PendingAdjustment[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const textRef = useRef<HTMLTextAreaElement>(null);

  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(candidates.map((c) => c.id)),
  );
  const [periodLabel, setPeriodLabel] = useState(defaultLabel);
  const [periodStart, setPeriodStart] = useState(defaultStart);
  const [periodEnd, setPeriodEnd] = useState(defaultEnd);

  const [manualText, setManualText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFallback, setCopyFallback] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = candidates.filter((c) => checked.has(c.id));

  // Build render context from checked lessons + all pending adjustments.
  const ctx: BillRenderContext = useMemo(() => {
    const groupMap = new Map<string, RenderGroup>();
    for (const c of selected) {
      const key = `${c.studentName}|${c.level}|${c.subject}`;
      const g = groupMap.get(key) ?? {
        studentName: c.studentName,
        level: c.level,
        subject: c.subject,
        lessons: [],
      };
      g.lessons.push({ startsAt: c.startsAt, durationMin: c.durationMin, rateCents: c.rateCents });
      groupMap.set(key, g);
    }
    return {
      payerName: payer.name,
      month: periodLabel,
      paynowNumber,
      groups: [...groupMap.values()],
      adjustments: adjustments.map((a) => ({ reason: a.reason, amountCents: a.amountCents })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, periodLabel]);

  const numbers = useMemo(() => computeBillNumbers(ctx), [ctx]);
  const preview = useMemo(() => renderTemplate(template, ctx), [ctx, template]);
  const messageText = manualText ?? preview;

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setManualText(null); // re-sync preview when the selection changes
    setCopied(false);
  }

  async function ensureDraft(): Promise<string | null> {
    const res = await createDraftBill({
      payerId: payer.id,
      periodLabel,
      periodStart,
      periodEnd,
      lessonIds: [...checked],
      adjustmentIds: adjustments.map((a) => a.id),
      messageText,
    });
    if (!res.ok || !res.billId) {
      setError(res.error ?? "Something went wrong.");
      return null;
    }
    return res.billId;
  }

  function saveDraft() {
    setError(null);
    startTransition(async () => {
      const id = await ensureDraft();
      if (id) router.push(`/money/bills/${id}`);
    });
  }

  async function copy() {
    setError(null);
    try {
      await navigator.clipboard.writeText(messageText);
      setCopied(true);
      setCopyFallback(false);
    } catch {
      textRef.current?.select();
      setCopyFallback(true);
    }
  }

  function markSent() {
    setError(null);
    startTransition(async () => {
      const id = await ensureDraft();
      if (!id) return;
      const res = await markBillSent(id, messageText);
      if (res.ok) {
        router.push(`/money/bills/${id}`);
      } else {
        setError(res.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {error && <div className="banner banner-error">{error}</div>}

      {/* Period */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Period label</label>
          <input className="input" value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} />
        </div>
        <div>
          <label className="label">Start</label>
          <input type="date" className="input" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        </div>
        <div>
          <label className="label">End</label>
          <input type="date" className="input" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </div>
      </div>

      {/* Lesson checklist */}
      <div>
        <h2 className="mb-1 font-semibold">Lessons</h2>
        <table className="table">
          <thead>
            <tr>
              <th></th>
              <th>When</th>
              <th>Student</th>
              <th>Status</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={c.id}>
                <td>
                  <input type="checkbox" checked={checked.has(c.id)} onChange={() => toggle(c.id)} />
                </td>
                <td>{formatLessonRange(c.startsAt, c.durationMin)}</td>
                <td>
                  {c.studentName} <span className="text-xs text-gray-500">· {c.level} {c.subject}</span>
                </td>
                <td>
                  <LessonStatusBadge status={c.status} />
                </td>
                <td className="text-right">
                  {formatMoney(lessonAmountCents(c.durationMin, c.rateCents))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Adjustments */}
      {adjustments.length > 0 && (
        <div>
          <h2 className="mb-1 font-semibold">Adjustments (included)</h2>
          <ul className="text-sm">
            {adjustments.map((a) => (
              <li key={a.id}>
                {a.amountCents >= 0 ? "Credit" : "Charge"} — {a.reason}:{" "}
                <strong>{formatMoney(-a.amountCents)}</strong> to balance
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-sm">
        Total: <strong>{formatMoney(numbers.totalCents)}</strong>
      </div>

      {/* Preview / message */}
      <div>
        <div className="flex items-center justify-between">
          <label className="label">Message</label>
          {manualText != null && (
            <button className="btn" onClick={() => { setManualText(null); setCopied(false); }}>
              Regenerate from lessons
            </button>
          )}
        </div>
        <textarea
          ref={textRef}
          className="input font-mono"
          rows={12}
          value={messageText}
          onChange={(e) => { setManualText(e.target.value); setCopied(false); }}
        />
      </div>

      {copyFallback && (
        <div className="banner banner-warn">
          Couldn’t copy automatically. The text is selected — press Ctrl/Cmd+C to copy.
        </div>
      )}
      {copied && (
        <div className="banner banner-success flex items-center justify-between">
          <span>Copied.</span>
          <button className="btn btn-primary" disabled={pending} onClick={markSent}>
            Mark as sent
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={pending} onClick={copy}>
          Copy to clipboard
        </button>
        <button className="btn" disabled={pending} onClick={saveDraft}>
          Save as draft
        </button>
        <button className="btn btn-primary" disabled={pending} onClick={markSent}>
          Mark as sent
        </button>
      </div>
      <p className="text-xs text-gray-500">
        Copying does not send the bill. “Mark as sent” records it as sent and
        freezes its lessons.
      </p>
    </div>
  );
}
