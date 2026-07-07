-- =============================================================================
-- Seed data. Run in the Supabase SQL editor AFTER you have signed up and
-- completed /setup (so a tutors row exists). Idempotent: re-running is a no-op
-- once seeded. Seeds for the most recently created tutor.
--
-- Creates: 2 payers (MONTHLY/SCHEDULED + PER_LESSON/COMPLETED), 3 students
-- (a sibling pair sharing a payer), 4 enrolments with two rates, ~6 weeks of
-- lessons in mixed statuses, one SENT bill with a partial payment, and one
-- pending adjustment — so every screen shows real data immediately.
-- =============================================================================
do $$
declare
  v_tutor    uuid;
  v_today    date;
  v_payer_a  uuid;  -- Mdm Lim  (MONTHLY / SCHEDULED)
  v_payer_b  uuid;  -- Mr Tan   (PER_LESSON / COMPLETED)
  v_amy      uuid;
  v_ben      uuid;
  v_cara     uuid;
  v_e_amy_sci uuid;
  v_e_amy_mth uuid;
  v_e_ben_eng uuid;
  v_e_cara_phy uuid;
  v_bill     uuid;
  v_total    int;
begin
  select id into v_tutor from tutors order by created_at desc limit 1;
  if v_tutor is null then
    raise exception 'No tutor found — sign up and complete /setup first.';
  end if;

  if exists (select 1 from payers where tutor_id = v_tutor and name = 'Mdm Lim') then
    raise notice 'Already seeded for this tutor — nothing to do.';
    return;
  end if;

  v_today := (now() at time zone 'Asia/Singapore')::date;

  -- Payers
  insert into payers (tutor_id, name, phone, billing_cycle, billing_basis)
    values (v_tutor, 'Mdm Lim', '91112222', 'MONTHLY', 'SCHEDULED')
    returning id into v_payer_a;
  insert into payers (tutor_id, name, phone, billing_cycle, billing_basis)
    values (v_tutor, 'Mr Tan', '93334444', 'PER_LESSON', 'COMPLETED')
    returning id into v_payer_b;

  -- Students (Amy & Ben are siblings under Mdm Lim)
  insert into students (tutor_id, payer_id, name, school, address, default_mode)
    values (v_tutor, v_payer_a, 'Amy Lim', 'Nan Hua High', '10 Clementi Ave 4', 'STUDENT_HOME')
    returning id into v_amy;
  insert into students (tutor_id, payer_id, name, school, address, default_mode)
    values (v_tutor, v_payer_a, 'Ben Lim', 'Nan Hua High', '10 Clementi Ave 4', 'STUDENT_HOME')
    returning id into v_ben;
  insert into students (tutor_id, payer_id, name, school, default_mode)
    values (v_tutor, v_payer_b, 'Cara Tan', 'Hwa Chong JC', 'ONLINE')
    returning id into v_cara;

  -- Enrolments (two distinct rates: $50 and $60)
  insert into enrollments (tutor_id, student_id, subject, level, default_rate_cents, default_duration_min)
    values (v_tutor, v_amy, 'Science', 'Sec 2 G3', 5000, 60) returning id into v_e_amy_sci;
  insert into enrollments (tutor_id, student_id, subject, level, default_rate_cents, default_duration_min)
    values (v_tutor, v_amy, 'Math', 'Sec 2 G3', 6000, 90) returning id into v_e_amy_mth;
  insert into enrollments (tutor_id, student_id, subject, level, default_rate_cents, default_duration_min)
    values (v_tutor, v_ben, 'English', 'Sec 4 G3', 5000, 60) returning id into v_e_ben_eng;
  insert into enrollments (tutor_id, student_id, subject, level, default_rate_cents, default_duration_min)
    values (v_tutor, v_cara, 'Physics', 'JC 1', 6000, 90) returning id into v_e_cara_phy;

  -- ~6 weeks of lessons per enrolment (weeks 0..3 past, 4..5 today/future),
  -- with a spread of statuses.
  insert into lessons (tutor_id, enrollment_id, starts_at, duration_min, rate_cents, status, mode, notes)
  select
    v_tutor,
    e.id,
    ((v_today + (w * 7 - 28))::text || ' ' || lpad((15 + e.rn)::text, 2, '0') || ':00:00')::timestamp
      at time zone 'Asia/Singapore',
    e.default_duration_min,
    e.default_rate_cents,
    (case
       when w >= 4 then 'SCHEDULED'
       when w = 3 and e.subject = 'English' then 'NO_SHOW'
       when w = 2 and e.subject = 'Math' then 'CANCELLED_FREE'
       when w = 1 and e.subject = 'Physics' then 'CANCELLED_BILLABLE'
       else 'COMPLETED'
     end)::lesson_status,
    'STUDENT_HOME'::teaching_mode,
    (case when w <= 3 then 'Covered practice questions' else null end)
  from (
    select id, subject, default_duration_min, default_rate_cents,
           row_number() over (order by created_at) as rn
    from enrollments where tutor_id = v_tutor
  ) e
  cross join generate_series(0, 5) as w;

  -- A SENT bill for Mdm Lim over her completed lessons in the last ~5 weeks,
  -- with a partial payment.
  insert into bills (tutor_id, payer_id, period_label, period_start, period_end, status, message_text, sent_at)
    values (
      v_tutor, v_payer_a,
      to_char(v_today, 'FMMonth YYYY'),
      date_trunc('month', v_today)::date,
      (date_trunc('month', v_today) + interval '1 month' - interval '1 day')::date,
      'SENT',
      'Hi Mdm Lim, please find this month''s tuition fees attached.',
      now() - interval '3 days'
    )
    returning id into v_bill;

  insert into bill_lessons (tutor_id, bill_id, lesson_id)
  select v_tutor, v_bill, l.id
  from lessons l
  join enrollments e on e.id = l.enrollment_id
  join students s on s.id = e.student_id
  where s.payer_id = v_payer_a
    and l.status = 'COMPLETED'
    and l.starts_at >= (now() - interval '35 days');

  select coalesce(sum(lesson_amount_cents(l.duration_min, l.rate_cents)), 0)
    into v_total
  from bill_lessons bl join lessons l on l.id = bl.lesson_id
  where bl.bill_id = v_bill;

  if v_total > 0 then
    insert into payments (tutor_id, payer_id, bill_id, paid_at, amount_cents, method, note)
      values (v_tutor, v_payer_a, v_bill, v_today - 1, greatest(v_total / 2, 100), 'PAYNOW', 'Partial payment');
    update bills set status = 'PARTIALLY_PAID' where id = v_bill;
  end if;

  -- One pending adjustment (appears on the payer's next bill).
  insert into adjustments (tutor_id, payer_id, amount_cents, reason)
    values (v_tutor, v_payer_a, 500, 'Referral credit');

  raise notice 'Seed complete for tutor %.', v_tutor;
end$$;
