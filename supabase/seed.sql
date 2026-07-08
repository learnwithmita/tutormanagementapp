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

-- =============================================================================
-- Progress (Milestone 8) seed. Separate idempotent block so it can be run even
-- if the base seed was applied earlier. Builds a Mathematics syllabus against
-- Amy's existing enrolment (so the Progress/In-depth tabs light up) plus a
-- small English syllabus for Ben, assorted work items (a PRACTICE in DONE and
-- one in MARKED — the marking queue), and papers (scored, unscored, a
-- duplicate-attempt pair, and one at a different level).
-- =============================================================================
do $$
declare
  v_tutor    uuid;
  v_amy_math uuid;  -- Amy's Math enrolment
  v_amy_lvl  text;
  v_amy_sub  text;
  v_ben_eng  uuid;  -- Ben's English enrolment
  v_ben_lvl  text;
  v_ben_sub  text;
  v_algebra  uuid;
  v_geometry uuid;
  v_fractions uuid;
begin
  select id into v_tutor from tutors order by created_at desc limit 1;
  if v_tutor is null then return; end if;

  select e.id, e.level, e.subject into v_amy_math, v_amy_lvl, v_amy_sub
  from enrollments e join students s on s.id = e.student_id
  where e.tutor_id = v_tutor and s.name = 'Amy Lim' and e.subject = 'Math'
  order by e.created_at limit 1;
  if v_amy_math is null then
    raise notice 'Base seed not present — run the base seed first.';
    return;
  end if;

  if exists (select 1 from topics where tutor_id = v_tutor and lower(name) = 'algebra' and level = v_amy_lvl and subject = v_amy_sub) then
    raise notice 'Progress already seeded — nothing to do.';
    return;
  end if;

  select e.id, e.level, e.subject into v_ben_eng, v_ben_lvl, v_ben_sub
  from enrollments e join students s on s.id = e.student_id
  where e.tutor_id = v_tutor and s.name = 'Ben Lim' and e.subject = 'English'
  order by e.created_at limit 1;

  -- Mathematics syllabus (6 topics) for Amy's level/subject.
  insert into topics (tutor_id, level, subject, name, sort_order) values
    (v_tutor, v_amy_lvl, v_amy_sub, 'Algebra',    0) returning id into v_algebra;
  insert into topics (tutor_id, level, subject, name, sort_order) values
    (v_tutor, v_amy_lvl, v_amy_sub, 'Geometry',   1) returning id into v_geometry;
  insert into topics (tutor_id, level, subject, name, sort_order) values
    (v_tutor, v_amy_lvl, v_amy_sub, 'Statistics', 2);
  insert into topics (tutor_id, level, subject, name, sort_order) values
    (v_tutor, v_amy_lvl, v_amy_sub, 'Fractions',  3) returning id into v_fractions;
  insert into topics (tutor_id, level, subject, name, sort_order) values
    (v_tutor, v_amy_lvl, v_amy_sub, 'Ratio',      4);
  insert into topics (tutor_id, level, subject, name, sort_order) values
    (v_tutor, v_amy_lvl, v_amy_sub, 'Percentage', 5);

  -- Amy: 3 topics checked.
  insert into topic_checks (tutor_id, enrollment_id, topic_id, checked, checked_at, remark) values
    (v_tutor, v_amy_math, v_algebra,   true, current_date - 20, 'Strong'),
    (v_tutor, v_amy_math, v_geometry,  true, current_date - 12, null),
    (v_tutor, v_amy_math, v_fractions, true, current_date - 4,  'Careless slips');

  -- Work items: notes in progress, a PRACTICE in DONE, a PRACTICE in MARKED.
  insert into work_items (tutor_id, enrollment_id, type, topic_id, title, status, started_at)
    values (v_tutor, v_amy_math, 'NOTES', v_algebra, 'Summary notes', 'IN_PROGRESS', current_date - 5);
  insert into work_items (tutor_id, enrollment_id, type, topic_id, title, status, started_at, updated_at)
    values (v_tutor, v_amy_math, 'PRACTICE', v_algebra, 'TYS Ex 4B', 'DONE', current_date - 3, now() - interval '3 days');
  insert into work_items (tutor_id, enrollment_id, type, topic_id, title, status, started_at, updated_at)
    values (v_tutor, v_amy_math, 'PRACTICE', v_geometry, 'Angles worksheet', 'MARKED', current_date - 6, now() - interval '2 days');

  -- Papers: completed+scored, marked+unscored, a duplicate-attempt pair, and
  -- one at a different level from the enrolment.
  insert into practice_papers (tutor_id, enrollment_id, school, level, exam_type, year, status, started_at, completed_at, score, max_score)
    values (v_tutor, v_amy_math, 'Bukit View Sec', v_amy_lvl, 'Mid-Year', 2024, 'COMPLETED', current_date - 30, current_date - 28, 38, 50);
  insert into practice_papers (tutor_id, enrollment_id, school, level, exam_type, year, status, started_at, updated_at)
    values (v_tutor, v_amy_math, 'Bukit View Sec', v_amy_lvl, 'Prelim', 2025, 'MARKED', current_date - 5, now() - interval '1 day');
  insert into practice_papers (tutor_id, enrollment_id, school, level, exam_type, year, status, started_at, completed_at, score, max_score) values
    (v_tutor, v_amy_math, 'Riverside Sec', v_amy_lvl, 'WA1', 2025, 'COMPLETED', current_date - 40, current_date - 39, 20, 25),
    (v_tutor, v_amy_math, 'Riverside Sec', v_amy_lvl, 'WA1', 2025, 'COMPLETED', current_date - 18, current_date - 17, 23, 25);
  insert into practice_papers (tutor_id, enrollment_id, school, level, exam_type, year, status, started_at, completed_at, score, max_score)
    values (v_tutor, v_amy_math, 'Riverside Sec', 'Sec 1', 'WA2', 2024, 'COMPLETED', current_date - 60, current_date - 59, 44, 50);

  -- Ben: a small English syllabus so a second student shows progress.
  if v_ben_eng is not null then
    insert into topics (tutor_id, level, subject, name, sort_order) values
      (v_tutor, v_ben_lvl, v_ben_sub, 'Comprehension', 0),
      (v_tutor, v_ben_lvl, v_ben_sub, 'Composition',   1),
      (v_tutor, v_ben_lvl, v_ben_sub, 'Oral',          2);
    insert into topic_checks (tutor_id, enrollment_id, topic_id, checked, checked_at)
    select v_tutor, v_ben_eng, t.id, true, current_date - 7
    from topics t where t.tutor_id = v_tutor and t.level = v_ben_lvl and t.subject = v_ben_sub and t.name = 'Comprehension';
  end if;

  raise notice 'Progress seed complete for tutor %.', v_tutor;
end$$;
