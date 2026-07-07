// Shared validation used by both client forms and server actions so the rules
// live in one place.

// Singapore mobile: 8 digits starting with 8 or 9.
export function isValidPaynow(value: string): boolean {
  return /^[89]\d{7}$/.test(value.trim());
}

// The placeholders both templates understand. Anything else is "unknown" and
// will render literally.
export const KNOWN_PLACEHOLDERS = [
  "payer_name",
  "month",
  "student_name",
  "level",
  "subject",
  "lesson_list",
  "total_hours",
  "rate",
  "total",
  "paynow_number",
  "receipt_no",
  "paid_date",
] as const;

// Returns the distinct unknown placeholders found in a template (e.g.
// "{payer_nam}"), each as the raw "{...}" token.
export function findUnknownPlaceholders(template: string): string[] {
  const found = new Set<string>();
  const re = /\{([a-zA-Z0-9_]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    const name = m[1]!;
    if (!(KNOWN_PLACEHOLDERS as readonly string[]).includes(name)) {
      found.add(`{${name}}`);
    }
  }
  return [...found];
}
