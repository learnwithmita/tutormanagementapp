"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/money";

export type StudentRow = {
  id: string;
  name: string;
  school: string | null;
  archived: boolean;
  payerId: string;
  payerName: string;
  chips: string[];
  balanceCents: number;
};

export default function StudentsList({ rows }: { rows: StudentRow[] }) {
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showArchived && r.archived) return false;
      if (!needle) return true;
      return (
        r.name.toLowerCase().includes(needle) ||
        r.payerName.toLowerCase().includes(needle) ||
        (r.school ?? "").toLowerCase().includes(needle)
      );
    });
  }, [rows, q, showArchived]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          className="input max-w-xs"
          placeholder="Search student, payer or school…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="text-sm">
          <input
            type="checkbox"
            className="mr-1"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="card text-sm text-gray-600">
          {rows.length === 0 ? (
            <>
              No students yet.{" "}
              <Link href="/students/new" className="underline">
                Add your first student
              </Link>
              .
            </>
          ) : (
            "No students match your search."
          )}
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Subjects</th>
              <th>Payer</th>
              <th className="text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className={r.archived ? "opacity-60" : ""}>
                <td>
                  <Link
                    href={`/students/${r.id}`}
                    className="font-medium underline"
                  >
                    {r.name}
                  </Link>
                  {r.archived && <span className="chip ml-2">Archived</span>}
                  {r.school && (
                    <div className="text-xs text-gray-500">{r.school}</div>
                  )}
                </td>
                <td>
                  {r.chips.length === 0 ? (
                    <span className="text-xs text-gray-400">
                      No active enrolments
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {r.chips.map((c, i) => (
                        <span key={i} className="chip">
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td>{r.payerName}</td>
                <td className="text-right">
                  <span
                    className={
                      r.balanceCents > 0 ? "font-semibold text-red-700" : ""
                    }
                  >
                    {formatMoney(r.balanceCents)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
