// Hand-maintained types mirroring supabase/migrations. Keep in sync with the
// SQL. (You can regenerate with `supabase gen types typescript` once the CLI is
// linked; until then this is the source of truth for the app.)

export type BillingCycle = "MONTHLY" | "PER_LESSON";
export type BillingBasis = "SCHEDULED" | "COMPLETED";
export type TeachingMode = "STUDENT_HOME" | "TUTOR_HOME" | "ONLINE";
export type LessonStatus =
  | "SCHEDULED"
  | "COMPLETED"
  | "CANCELLED_BILLABLE"
  | "CANCELLED_FREE"
  | "NO_SHOW";
export type BillStatus =
  | "DRAFT"
  | "SENT"
  | "PARTIALLY_PAID"
  | "PAID"
  | "VOID";
export type PaymentMethod = "PAYNOW" | "CASH" | "BANK_TRANSFER" | "OTHER";
export type ReceiptStatus = "ISSUED" | "SUPERSEDED";

export interface Tutor {
  id: string;
  name: string | null;
  email: string | null;
  paynow_number: string | null;
  bill_template: string;
  receipt_template: string;
  next_receipt_seq: number;
  created_at: string;
  updated_at: string;
}

export interface Payer {
  id: string;
  tutor_id: string;
  name: string;
  phone: string | null;
  billing_cycle: BillingCycle;
  billing_basis: BillingBasis;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Student {
  id: string;
  tutor_id: string;
  payer_id: string;
  name: string;
  school: string | null;
  address: string | null;
  notes: string | null;
  default_mode: TeachingMode;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Enrollment {
  id: string;
  tutor_id: string;
  student_id: string;
  subject: string;
  level: string;
  default_rate_cents: number;
  default_duration_min: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecurringSchedule {
  id: string;
  tutor_id: string;
  enrollment_id: string;
  day_of_week: number;
  start_time: string; // "HH:MM:SS"
  duration_min: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Lesson {
  id: string;
  tutor_id: string;
  enrollment_id: string;
  recurring_schedule_id: string | null;
  starts_at: string; // timestamptz ISO
  duration_min: number;
  rate_cents: number;
  status: LessonStatus;
  mode: TeachingMode;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Bill {
  id: string;
  tutor_id: string;
  payer_id: string;
  period_label: string | null;
  period_start: string | null; // date
  period_end: string | null; // date
  status: BillStatus;
  message_text: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillLesson {
  id: string;
  tutor_id: string;
  bill_id: string;
  lesson_id: string;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  tutor_id: string;
  payer_id: string;
  bill_id: string | null;
  paid_at: string; // date
  amount_cents: number;
  method: PaymentMethod;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Adjustment {
  id: string;
  tutor_id: string;
  payer_id: string;
  amount_cents: number; // + credit to payer, - extra charge
  reason: string;
  related_bill_id: string | null; // null = pending
  created_at: string;
  updated_at: string;
}

export interface Receipt {
  id: string;
  tutor_id: string;
  bill_id: string;
  receipt_no: string;
  message_text: string | null;
  status: ReceiptStatus;
  issued_at: string;
  created_at: string;
  updated_at: string;
}

// View / RPC return shapes
export interface BillTotals {
  bill_id: string;
  tutor_id: string;
  payer_id: string;
  lessons_subtotal_cents: number;
  adjustments_cents: number;
  total_cents: number;
  paid_cents: number;
  outstanding_cents: number;
}

export interface PayerLedgerEntry {
  tutor_id: string;
  payer_id: string;
  entry_at: string;
  entry_type: "BILL" | "PAYMENT" | "ADJUSTMENT";
  ref_id: string;
  description: string;
  amount_cents: number;
  running_balance_cents: number;
}

export interface MonthlySummary {
  lesson_count: number;
  teaching_hours: number;
  earned_income_cents: number;
  billed_cents: number;
  paid_cents: number;
  outstanding_cents: number;
}

export interface StudentSummary {
  lesson_count: number;
  teaching_hours: number;
  earned_income_cents: number;
  billed_cents: number;
  paid_cents: number;
  outstanding_cents: number;
  distinct_rates_cents: number[];
}
