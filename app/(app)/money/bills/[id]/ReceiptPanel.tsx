"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { issueReceipt } from "@/app/(app)/money/receipt-actions";
import { renderTemplate, type RenderGroup } from "@/lib/render";

type ReceiptContext = {
  payerName: string;
  month: string;
  paynowNumber: string;
  totalCents: number;
  paidDate: string;
  lessons: {
    studentName: string;
    level: string;
    subject: string;
    startsAt: string;
    durationMin: number;
    rateCents: number;
    status: string;
  }[];
};

export default function ReceiptPanel({
  billId,
  receipt,
  template,
  context,
}: {
  billId: string;
  receipt: { receiptNo: string; status: string; messageText: string | null } | null;
  template: string;
  context: ReceiptContext;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFallback, setCopyFallback] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const preview = useMemo(() => {
    const groupMap = new Map<string, RenderGroup>();
    for (const l of context.lessons) {
      if (l.status === "CANCELLED_FREE") continue;
      const key = `${l.studentName}|${l.level}|${l.subject}`;
      const g = groupMap.get(key) ?? {
        studentName: l.studentName,
        level: l.level,
        subject: l.subject,
        lessons: [],
      };
      g.lessons.push({ startsAt: l.startsAt, durationMin: l.durationMin, rateCents: l.rateCents });
      groupMap.set(key, g);
    }
    return renderTemplate(template, {
      payerName: context.payerName,
      month: context.month,
      paynowNumber: context.paynowNumber,
      groups: [...groupMap.values()],
      adjustments: [],
      receiptNo: "(assigned on issue)",
      paidDate: context.paidDate,
    });
  }, [template, context]);

  const displayText = receipt?.messageText ?? preview;

  async function copy() {
    setError(null);
    try {
      await navigator.clipboard.writeText(displayText);
      setCopied(true);
      setCopyFallback(false);
    } catch {
      textRef.current?.select();
      setCopyFallback(true);
    }
  }

  function issue() {
    setError(null);
    startTransition(async () => {
      const res = await issueReceipt(billId);
      if (res.ok) router.refresh();
      else setError(res.error ?? "Something went wrong.");
    });
  }

  return (
    <section className="card space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">
          Receipt {receipt && <span className="chip ml-1">{receipt.receiptNo}</span>}
        </h2>
      </div>
      {receipt?.status === "SUPERSEDED" && (
        <div className="banner banner-warn">
          This receipt was superseded (a payment was deleted). You may need to
          inform the payer.
        </div>
      )}
      {error && <div className="banner banner-error">{error}</div>}

      <textarea ref={textRef} className="input font-mono" rows={7} value={displayText} readOnly />

      {copyFallback && (
        <div className="banner banner-warn">
          Couldn’t copy automatically. The text is selected — press Ctrl/Cmd+C.
        </div>
      )}
      {copied && !receipt && (
        <div className="banner banner-success flex items-center justify-between">
          <span>Copied.</span>
          <button className="btn btn-primary" disabled={pending} onClick={issue}>
            Mark as issued
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button className="btn" onClick={copy}>
          {receipt ? "Copy again" : "Copy to clipboard"}
        </button>
        {!receipt && (
          <button className="btn btn-primary" disabled={pending} onClick={issue}>
            Generate receipt
          </button>
        )}
      </div>
    </section>
  );
}
