import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todaySGT, formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import PayerLedgerActions from "./PayerLedgerActions";
import type { PayerLedgerEntry } from "@/lib/database.types";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  BILL: "Bill",
  PAYMENT: "Payment",
  ADJUSTMENT: "Adjustment",
};

export default async function PayerLedgerPage({
  params,
}: {
  params: { id: string };
}) {
  const payerId = params.id;
  const month = todaySGT().slice(0, 7);
  const supabase = await createClient();

  const { data: payer } = await supabase
    .from("payers")
    .select("id,name,phone,billing_cycle,billing_basis")
    .eq("id", payerId)
    .maybeSingle();
  if (!payer) notFound();

  const [{ data: ledger }, { data: balance }] = await Promise.all([
    supabase
      .from("v_payer_ledger")
      .select("*")
      .eq("payer_id", payerId)
      .order("entry_at", { ascending: true }),
    supabase.from("v_payer_balances").select("balance_cents").eq("payer_id", payerId).maybeSingle(),
  ]);

  const entries = (ledger ?? []) as PayerLedgerEntry[];
  const balanceCents = balance?.balance_cents ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/money" className="text-sm underline">
          ← Money
        </Link>
        <h1 className="text-xl font-semibold">{payer.name}</h1>
        <p className="text-sm text-gray-600">
          {payer.billing_cycle} · {payer.billing_basis}
          {payer.phone && <> · {payer.phone}</>}
        </p>
        <p className="mt-1">
          Current balance:{" "}
          <span className={`font-semibold ${balanceCents > 0 ? "text-red-700" : balanceCents < 0 ? "text-green-700" : ""}`}>
            {formatMoney(balanceCents)}
          </span>{" "}
          <span className="text-xs text-gray-500">
            {balanceCents > 0 ? "(owes)" : balanceCents < 0 ? "(in credit)" : ""}
          </span>
        </p>
      </div>

      <PayerLedgerActions payerId={payer.id} month={month} />

      <section>
        <h2 className="mb-1 font-semibold">Ledger</h2>
        {entries.length === 0 ? (
          <div className="card text-sm text-gray-600">No activity yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={`${e.entry_type}-${e.ref_id}`}>
                  <td>{formatDate(e.entry_at)}</td>
                  <td>
                    {e.entry_type === "BILL" ? (
                      <Link href={`/money/bills/${e.ref_id}`} className="underline">
                        {TYPE_LABEL[e.entry_type]}
                      </Link>
                    ) : (
                      TYPE_LABEL[e.entry_type]
                    )}
                  </td>
                  <td>{e.description}</td>
                  <td className={`text-right ${e.amount_cents < 0 ? "text-green-700" : ""}`}>
                    {formatMoney(e.amount_cents)}
                  </td>
                  <td className="text-right font-medium">
                    {formatMoney(e.running_balance_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
