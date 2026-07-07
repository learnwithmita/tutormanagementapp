-- =============================================================================
-- Milestone 1 — Core schema: extensions, enums, tables, constraints, indexes.
-- All money is integer cents. All timestamps are timestamptz; the app formats
-- them in Asia/Singapore. Every table except `tutors` carries tutor_id for
-- multi-tenant RLS (policies live in a later migration).
-- =============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- -----------------------------------------------------------------------------
-- Enum types
-- -----------------------------------------------------------------------------
create type billing_cycle  as enum ('MONTHLY', 'PER_LESSON');
create type billing_basis  as enum ('SCHEDULED', 'COMPLETED');
create type teaching_mode  as enum ('STUDENT_HOME', 'TUTOR_HOME', 'ONLINE');
create type lesson_status  as enum ('SCHEDULED', 'COMPLETED', 'CANCELLED_BILLABLE', 'CANCELLED_FREE', 'NO_SHOW');
create type bill_status    as enum ('DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'VOID');
create type payment_method as enum ('PAYNOW', 'CASH', 'BANK_TRANSFER', 'OTHER');
create type receipt_status as enum ('ISSUED', 'SUPERSEDED');

-- -----------------------------------------------------------------------------
-- Default message templates (seeded as column defaults on `tutors`).
-- Placeholders documented next to the Settings editor in the app.
-- -----------------------------------------------------------------------------
-- (embedded inline below via dollar-quoted defaults)

-- -----------------------------------------------------------------------------
-- tutors — one row per authenticated Supabase Auth user. id = auth.users.id.
-- -----------------------------------------------------------------------------
create table tutors (
  id               uuid primary key
                     references auth.users(id) on delete cascade,   -- == auth.users.id
  name             text,
  email            text,
  paynow_number    text
                     check (paynow_number is null
                            or paynow_number ~ '^[89][0-9]{7}$'),  -- 8 digits, starts 8/9
  bill_template    text not null default
$tmpl$Hi {payer_name} the tuition fees are as follows for the month of {month} for {level} {subject}
{lesson_list}
Total {total_hours} hours x ${rate} = ${total}

Please paynow the amount to my number {paynow_number} and send me a screenshot$tmpl$,
  receipt_template text not null default
$tmpl$Receipt {receipt_no}
Received from {payer_name} on {paid_date}: ${total}
For {level} {subject} tuition — {month}
{lesson_list}
Thank you!$tmpl$,
  next_receipt_seq int not null default 1 check (next_receipt_seq > 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- payers — the paying contact (usually a parent).
-- -----------------------------------------------------------------------------
create table payers (
  id            uuid primary key default gen_random_uuid(),
  tutor_id      uuid not null references tutors(id),
  name          text not null,
  phone         text,
  billing_cycle billing_cycle not null default 'MONTHLY',
  billing_basis billing_basis not null default 'SCHEDULED',
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_payers_tutor on payers(tutor_id);

-- -----------------------------------------------------------------------------
-- students
-- -----------------------------------------------------------------------------
create table students (
  id           uuid primary key default gen_random_uuid(),
  tutor_id     uuid not null references tutors(id),
  payer_id     uuid not null references payers(id),
  name         text not null,
  school       text,
  address      text,
  notes        text,
  default_mode teaching_mode not null default 'STUDENT_HOME',
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_students_tutor on students(tutor_id);
create index idx_students_payer on students(payer_id);

-- -----------------------------------------------------------------------------
-- enrollments — student × subject × level. Two subjects = two enrollments.
-- Level promotion = archive old, create new; history stays on the old row.
-- -----------------------------------------------------------------------------
create table enrollments (
  id                 uuid primary key default gen_random_uuid(),
  tutor_id           uuid not null references tutors(id),
  student_id         uuid not null references students(id),
  subject            text not null,
  level              text not null,
  default_rate_cents int not null check (default_rate_cents > 0),
  default_duration_min int not null check (default_duration_min > 0),
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index idx_enrollments_tutor   on enrollments(tutor_id);
create index idx_enrollments_student on enrollments(student_id);

-- -----------------------------------------------------------------------------
-- recurring_schedules — weekly slots; occurrences materialise as `lessons`
-- rows ~8 weeks ahead via generate_recurring_lessons() (idempotent).
-- -----------------------------------------------------------------------------
create table recurring_schedules (
  id            uuid primary key default gen_random_uuid(),
  tutor_id      uuid not null references tutors(id),
  enrollment_id uuid not null references enrollments(id),
  day_of_week   int  not null check (day_of_week between 0 and 6),  -- 0 = Sunday
  start_time    time not null,
  duration_min  int  not null check (duration_min > 0),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_recurring_tutor      on recurring_schedules(tutor_id);
create index idx_recurring_enrollment on recurring_schedules(enrollment_id);

-- -----------------------------------------------------------------------------
-- lessons — one row per scheduled/ad-hoc lesson.
--   rate_cents is snapshotted from the enrollment at creation; editing the
--   enrollment default never changes existing lessons.
--   Amount owed is ALWAYS computed (duration_min / 60 * rate_cents); no stored
--   amount column. Lessons are never auto-completed — completion is deliberate.
-- -----------------------------------------------------------------------------
create table lessons (
  id                   uuid primary key default gen_random_uuid(),
  tutor_id             uuid not null references tutors(id),
  enrollment_id        uuid not null references enrollments(id),
  recurring_schedule_id uuid references recurring_schedules(id),  -- null = ad-hoc
  starts_at            timestamptz not null,
  duration_min         int not null check (duration_min > 0),
  rate_cents           int not null check (rate_cents > 0),       -- snapshot
  status               lesson_status not null default 'SCHEDULED',
  mode                 teaching_mode not null default 'STUDENT_HOME',
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index idx_lessons_tutor     on lessons(tutor_id, starts_at);
create index idx_lessons_enrollment on lessons(enrollment_id);
create index idx_lessons_schedule   on lessons(recurring_schedule_id);
-- Fast idempotency lookup for recurring generation (per schedule per local day):
create index idx_lessons_sched_localdate
  on lessons(recurring_schedule_id, ((starts_at at time zone 'Asia/Singapore')::date));

-- -----------------------------------------------------------------------------
-- bills — total is computed from linked lessons (see v_bill_totals), not stored.
--   message_text is the exact text copied to clipboard (incl. manual edits).
-- -----------------------------------------------------------------------------
create table bills (
  id           uuid primary key default gen_random_uuid(),
  tutor_id     uuid not null references tutors(id),
  payer_id     uuid not null references payers(id),
  period_label text,
  period_start date,
  period_end   date,
  status       bill_status not null default 'DRAFT',
  message_text text,
  sent_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_bills_tutor on bills(tutor_id);
create index idx_bills_payer on bills(payer_id);

-- -----------------------------------------------------------------------------
-- bill_lessons — join. A lesson may appear on at most one NON-VOID bill.
--   unique(bill_id, lesson_id) + guard trigger (next migration).
-- -----------------------------------------------------------------------------
create table bill_lessons (
  id         uuid primary key default gen_random_uuid(),
  tutor_id   uuid not null references tutors(id),
  bill_id    uuid not null references bills(id),
  lesson_id  uuid not null references lessons(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bill_id, lesson_id)
);
create index idx_bill_lessons_lesson on bill_lessons(lesson_id);
create index idx_bill_lessons_bill   on bill_lessons(bill_id);

-- -----------------------------------------------------------------------------
-- payments — recorded against a bill (or loose on the payer account).
-- -----------------------------------------------------------------------------
create table payments (
  id           uuid primary key default gen_random_uuid(),
  tutor_id     uuid not null references tutors(id),
  payer_id     uuid not null references payers(id),
  bill_id      uuid references bills(id),
  paid_at      date not null,
  amount_cents int  not null check (amount_cents > 0),
  method       payment_method not null default 'PAYNOW',
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_payments_payer on payments(payer_id);
create index idx_payments_bill  on payments(bill_id);

-- -----------------------------------------------------------------------------
-- adjustments — credits/debits outside lessons.
--   amount_cents: positive = credit to payer (refund), negative = extra charge.
--   related_bill_id: the bill this adjustment has been APPLIED to (a line on
--     that bill). NULL = pending (will appear on the payer's next generated
--     bill). The originating event is captured in `reason`.
-- -----------------------------------------------------------------------------
create table adjustments (
  id              uuid primary key default gen_random_uuid(),
  tutor_id        uuid not null references tutors(id),
  payer_id        uuid not null references payers(id),
  amount_cents    int not null check (amount_cents <> 0),
  reason          text not null,
  related_bill_id uuid references bills(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_adjustments_payer on adjustments(payer_id);
create index idx_adjustments_bill  on adjustments(related_bill_id);

-- -----------------------------------------------------------------------------
-- receipts — one per bill; sequential receipt_no allocated atomically.
-- -----------------------------------------------------------------------------
create table receipts (
  id           uuid primary key default gen_random_uuid(),
  tutor_id     uuid not null references tutors(id),
  bill_id      uuid not null unique references bills(id),
  receipt_no   text not null,                 -- R-YYYY-NNNN
  message_text text,
  status       receipt_status not null default 'ISSUED',
  issued_at    timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tutor_id, receipt_no)
);
create index idx_receipts_bill on receipts(bill_id);
