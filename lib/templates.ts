// Default message templates — must match the column defaults in
// supabase/migrations/20260707120000_init_schema.sql exactly.

export const DEFAULT_BILL_TEMPLATE = `Hi {payer_name} the tuition fees are as follows for the month of {month} for {level} {subject}
{lesson_list}
Total {total_hours} hours x \${rate} = \${total}

Please paynow the amount to my number {paynow_number} and send me a screenshot`;

export const DEFAULT_RECEIPT_TEMPLATE = `Receipt {receipt_no}
Received from {payer_name} on {paid_date}: \${total}
For {level} {subject} tuition — {month}
{lesson_list}
Thank you!`;

// Static legend shown beside each template editor.
export const PLACEHOLDER_LEGEND: { token: string; outputs: string }[] = [
  { token: "{payer_name}", outputs: "The payer's name" },
  { token: "{month}", outputs: 'Bill period label, e.g. "June 2026"' },
  { token: "{student_name}", outputs: "Student's name (group headings)" },
  { token: "{level}", outputs: 'Level, e.g. "Sec 2 G3"' },
  { token: "{subject}", outputs: 'Subject, e.g. "Science"' },
  {
    token: "{lesson_list}",
    outputs: "Itemised lessons, one per line (grouped when needed)",
  },
  { token: "{total_hours}", outputs: 'Total billed hours ("3", "1.5")' },
  { token: "{rate}", outputs: "Hourly rate (uniform-rate bills only)" },
  { token: "{total}", outputs: "Total amount due" },
  { token: "{paynow_number}", outputs: "Your PayNow number" },
  { token: "{receipt_no}", outputs: "Receipt number (receipts only)" },
  { token: "{paid_date}", outputs: "Date paid (receipts only)" },
];
