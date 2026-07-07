"use client";

import { useEffect, useState, useTransition } from "react";
import {
  getStudentSummary,
  type StudentSummaryResult,
  type PaymentStatus,
} from "./summary-actions";
import { formatMoney } from "@/lib/money";
import { formatHours, formatDate } from "@/lib/format";

const SGT = "Asia/Singapore";
function ymd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SGT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
function monthBounds(offset: number): { from: string; to: string } {
  // offset 0 = this month, -1 = last month (SGT)
  const nowYmd = ymd(new Date());
  const [y, m] = nowYmd.split("-").map(Number);
  const target = new Date(Date.UTC(y!, m! - 1 + offset, 1, 4)); // noon-ish SGT
  const ty = target.getUTCFullYear();
  const tm = target.getUTCMonth(); // 0-based
  const from = `${ty}-${String(tm + 1).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const to = `${ty}-${String(tm + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

type Preset = "this" | "last" | "all" | "custom";

const STATUS_CHIP: Record<PaymentStatus, { label: string; cls: string } | null> = {
  PAID: { label: "Paid", cls: "border-green-500 bg-green-50 text-green-800" },
  PARTIAL: { label: "Partially paid", cls: "border-yellow-500 bg-yellow-50 text-yellow-900" },
  UNPAID: { label: "Unpaid", cls: "border-red-500 bg-red-50 text-red-800" },
  NONE: null,
};

export default function FinancialSummary({ studentId }: { studentId: string }) {
  const [preset, setPreset] = useState<Preset>("all");
  const [from, setFrom] = useState("2000-01-01");
  const [to, setTo] = useState(ymd(new Date()));
  const [data, setData] = useState<StudentSummaryResult | null>(null);
  const [pending, startTransition] = useTransition();

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p === "this") {
      const b = monthBounds(0);
      setFrom(b.from);
      setTo(b.to);
    } else if (p === "last") {
      const b = monthBounds(-1);
      setFrom(b.from);
      setTo(b.to);
    } else if (p === "all") {
      setFrom("2000-01-01");
      setTo(ymd(new Date()));
    }
  }

  useEffect(() => {
    startTransition(async () => {
      setData(await getStudentSummary(studentId, from, to));
    });
  }, [studentId, from, to]);

  const s = data?.summary;
  const statusChip = data ? STATUS_CHIP[data.paymentStatus] : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        {(["this", "last", "all", "custom"] as Preset[]).map((p) => (
          <button
            key={p}
            className={`chip ${preset === p ? "bg-blue-100 font-semibold" : ""}`}
            onClick={() => applyPreset(p)}
          >
            {p === "this" ? "This month" : p === "last" ? "Last month" : p === "all" ? "All time" : "Custom"}
          </button>
        ))}
        {statusChip && (
          <span className={`ml-2 inline-block border px-1.5 py-0.5 text-xs ${statusChip.cls}`}>
            {statusChip.label}
          </span>
        )}
      </div>

      {preset === "custom" && (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label">From</label>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      )}

      {pending && !s ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : s ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Lessons" value={String(s.lesson_count)} />
            <Stat label="Teaching hours" value={formatHours(s.teaching_hours)} />
            <Stat label="Earned" value={formatMoney(s.earned_income_cents)} />
            <Stat label="Billed" value={formatMoney(s.billed_cents)} />
            <Stat label="Paid" value={formatMoney(s.paid_cents)} />
            <Stat label="Outstanding" value={formatMoney(s.outstanding_cents)} red={s.outstanding_cents > 0} />
          </div>
          <div>
            <span className="text-xs text-gray-500">Rates used: </span>
            {(data?.rateRanges ?? []).length === 0 ? (
              <span className="text-xs text-gray-400">—</span>
            ) : data!.rateRanges.length === 1 ? (
              <span className="chip">{formatMoney(data!.rateRanges[0]!.rateCents)}/h</span>
            ) : (
              data!.rateRanges.map((r) => (
                <span key={r.rateCents} className="chip mr-1">
                  {formatMoney(r.rateCents)}/h ({formatDate(`${r.from}T12:00:00+08:00`)} – {formatDate(`${r.to}T12:00:00+08:00`)})
                </span>
              ))
            )}
          </div>
        </>
      ) : null}
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
