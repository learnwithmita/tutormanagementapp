-- =============================================================================
-- Milestone 1 — Functions & triggers: updated_at, money helper, integrity
-- guards (frozen-bill + one-bill-per-lesson), recurring generation, receipt
-- numbering. All functions run SECURITY INVOKER so per-tutor RLS applies.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'tutors','payers','students','enrollments','recurring_schedules',
    'lessons','bills','bill_lessons','payments','adjustments','receipts'
  ] loop
    execute format(
      'create trigger trg_%1$s_updated_at before update on %1$s
       for each row execute function set_updated_at()', t);
  end loop;
end$$;

-- -----------------------------------------------------------------------------
-- Money helper — the single source of truth for a lesson's billable amount.
-- amount = round(rate_cents * duration_min / 60), to the nearest cent.
-- -----------------------------------------------------------------------------
create or replace function lesson_amount_cents(p_duration_min int, p_rate_cents int)
returns int
language sql immutable
set search_path = public, pg_temp
as $$
  select round(p_rate_cents::numeric * p_duration_min / 60.0)::int;
$$;

-- -----------------------------------------------------------------------------
-- RULE: a lesson may appear on at most one NON-VOID bill.
-- (unique(bill_id, lesson_id) stops exact dupes; this stops two different
--  non-void bills.)
-- -----------------------------------------------------------------------------
create or replace function guard_bill_lesson_unique()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from bill_lessons bl
    join bills b on b.id = bl.bill_id
    where bl.lesson_id = new.lesson_id
      and bl.bill_id  <> new.bill_id
      and b.status    <> 'VOID'
  ) then
    raise exception 'Lesson % is already on another active (non-void) bill', new.lesson_id
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_guard_bill_lesson_unique
  before insert or update on bill_lessons
  for each row execute function guard_bill_lesson_unique();

-- -----------------------------------------------------------------------------
-- RULE (frozen-bill): a lesson linked to a SENT / PARTIALLY_PAID / PAID bill
-- cannot be edited or deleted. This is the hard DB backstop; the UI presents
-- the "Void & regenerate / Adjust next bill / Cancel" dialog before ever
-- reaching here. Voiding a bill (status -> VOID) releases its lessons.
-- -----------------------------------------------------------------------------
create or replace function guard_frozen_lesson()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_label  text;
  v_status bill_status;
begin
  select b.period_label, b.status
    into v_label, v_status
  from bill_lessons bl
  join bills b on b.id = bl.bill_id
  where bl.lesson_id = coalesce(old.id, new.id)
    and b.status in ('SENT','PARTIALLY_PAID','PAID')
  limit 1;

  if found then
    raise exception
      'Lesson is on bill "%" (%) that was already sent. Void the bill or add an adjustment instead.',
      v_label, v_status
      using errcode = 'P0001';
  end if;

  return coalesce(new, old);  -- NEW on UPDATE, OLD on DELETE
end;
$$;

create trigger trg_guard_frozen_lesson
  before update or delete on lessons
  for each row execute function guard_frozen_lesson();

-- -----------------------------------------------------------------------------
-- Recurring generation — materialise lessons ~8 weeks ahead. Idempotent:
-- skips any local (SGT) date on which a lesson from this schedule already
-- exists. Snapshots rate from the enrollment and mode from the student.
-- -----------------------------------------------------------------------------
create or replace function generate_recurring_lessons(p_schedule_id uuid, p_weeks int default 8)
returns int
language plpgsql
set search_path = public, pg_temp
as $$
declare
  s          recurring_schedules%rowtype;
  e          enrollments%rowtype;
  v_mode     teaching_mode;
  d          date;
  start_date date;
  end_date   date;
  ts         timestamptz;
  inserted   int := 0;
begin
  select * into s from recurring_schedules where id = p_schedule_id;
  if not found or not s.active then
    return 0;
  end if;

  select * into e from enrollments where id = s.enrollment_id;
  if not found or e.archived_at is not null then
    return 0;
  end if;

  select st.default_mode into v_mode from students st where st.id = e.student_id;

  start_date := (now() at time zone 'Asia/Singapore')::date;
  end_date   := start_date + (p_weeks * 7);

  -- advance to the first matching day-of-week on/after today
  d := start_date;
  while extract(dow from d)::int <> s.day_of_week loop
    d := d + 1;
  end loop;

  while d <= end_date loop
    ts := (d::text || ' ' || s.start_time::text)::timestamp at time zone 'Asia/Singapore';

    if not exists (
      select 1 from lessons l
      where l.recurring_schedule_id = s.id
        and (l.starts_at at time zone 'Asia/Singapore')::date = d
    ) then
      insert into lessons
        (tutor_id, enrollment_id, recurring_schedule_id, starts_at,
         duration_min, rate_cents, mode, status)
      values
        (e.tutor_id, e.id, s.id, ts,
         s.duration_min, e.default_rate_cents, coalesce(v_mode,'STUDENT_HOME'), 'SCHEDULED');
      inserted := inserted + 1;
    end if;

    d := d + 7;
  end loop;

  return inserted;
end;
$$;

-- Generate for every active schedule owned by the caller (RLS scopes rows).
-- Runs on app load (daily) to keep the ~8-week horizon topped up.
create or replace function generate_all_recurring_lessons(p_weeks int default 8)
returns int
language plpgsql
set search_path = public, pg_temp
as $$
declare
  rec   record;
  total int := 0;
begin
  for rec in select id from recurring_schedules where active loop
    total := total + generate_recurring_lessons(rec.id, p_weeks);
  end loop;
  return total;
end;
$$;

-- -----------------------------------------------------------------------------
-- Receipt numbering — allocate R-YYYY-NNNN atomically and insert the receipt.
-- NNNN comes from tutors.next_receipt_seq (continuous, not reset per year),
-- incremented under a row lock so concurrent issues never collide.
-- -----------------------------------------------------------------------------
create or replace function issue_receipt(p_bill_id uuid, p_message_text text)
returns receipts
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_tutor uuid;
  v_seq   int;
  v_no    text;
  r       receipts;
begin
  select tutor_id into v_tutor from bills where id = p_bill_id;
  if v_tutor is null then
    raise exception 'Bill % not found', p_bill_id using errcode = 'P0001';
  end if;

  -- lock the tutor row so the sequence read+increment is atomic
  select next_receipt_seq into v_seq from tutors where id = v_tutor for update;

  v_no := 'R-' || to_char(now() at time zone 'Asia/Singapore', 'YYYY')
              || '-' || lpad(v_seq::text, 4, '0');

  update tutors set next_receipt_seq = next_receipt_seq + 1 where id = v_tutor;

  insert into receipts (tutor_id, bill_id, receipt_no, message_text, status, issued_at)
  values (v_tutor, p_bill_id, v_no, p_message_text, 'ISSUED', now())
  returning * into r;

  return r;
end;
$$;
