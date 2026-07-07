// All money is integer cents. These helpers are the single place money is
// formatted or parsed for display/input.

// "$150" when the amount is whole dollars; "$112.50" otherwise. Negative
// amounts render as "-$50".
export function formatMoney(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const body =
    rem === 0
      ? dollars.toLocaleString("en-SG")
      : `${dollars.toLocaleString("en-SG")}.${rem.toString().padStart(2, "0")}`;
  return `${sign}$${body}`;
}

// Parse a dollar string (e.g. "50", "112.50", "$1,200.5") to integer cents.
// Returns null when the input is not a valid non-negative money amount.
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isFinite(cents) ? cents : null;
}

// Cents -> a plain editable dollar string for form inputs ("5000" -> "50.00").
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

// Amount digits WITHOUT a currency sign, for templates that already contain a
// literal "$" before the placeholder ("$150", "$112.50"). Negative keeps sign.
export function amountDigits(cents: number): string {
  return formatMoney(cents).replace("$", "");
}

// A lesson's billable amount. MUST match lesson_amount_cents() in SQL:
// round(rate_cents * duration_min / 60) to the nearest cent.
export function lessonAmountCents(durationMin: number, rateCents: number): number {
  return Math.round((rateCents * durationMin) / 60);
}
