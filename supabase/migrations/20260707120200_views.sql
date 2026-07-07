-- =============================================================================
-- Milestone 1 — Read models. All views use security_invoker so per-tutor RLS
-- on the base tables applies to whoever queries them.
--
-- Sign conventions (consistent across every read model):
--   * A lesson's billable amount = lesson_amount_cents(duration_min, rate_cents),
--     counted only when status <> CANCELLED_FREE.
--   * adjustments.amount_cents: positive = credit to payer, negative = charge.
--     Effect on "amount owed" / ledger balance = -amount_cents
--     (a credit reduces what the payer owes; a charge increases it).
--   * Ledger balance: positive = payer owes; negative = payer in credit.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- v_bill_totals — money on a single bill.
--   lessons_subtotal_cents : sum of linked, non-free lessons.
--   adjustments_cents      : sum of amount_cents of adjustments APPLIED to this
--                            bill (positive = credit).
--   total_cents            : amount to collect = subtotal - adjustments.
--   paid_cents             : payments recorded against this bill.
--   outstanding_cents      : total - paid.
-- -----------------------------------------------------------------------------
create or replace view v_bill_totals
with (security_invoker = true) as
with lesson_sums as (
  select bl.bill_id,
         sum(lesson_amount_cents(l.duration_min, l.rate_cents)) as lessons_subtotal
  from bill_lessons bl
  join lessons l on l.id = bl.lesson_id
  where l.status <> 'CANCELLED_FREE'
  group by bl.bill_id
),
adj_sums as (
  select related_bill_id as bill_id, sum(amount_cents) as adj_amount
  from adjustments
  where related_bill_id is not null
  group by related_bill_id
),
pay_sums as (
  select bill_id, sum(amount_cents) as paid
  from payments
  where bill_id is not null
  group by bill_id
)
select
  b.id       as bill_id,
  b.tutor_id,
  b.payer_id,
  coalesce(ls.lessons_subtotal, 0)                                   as lessons_subtotal_cents,
  coalesce(a.adj_amount, 0)                                          as adjustments_cents,
  coalesce(ls.lessons_subtotal, 0) - coalesce(a.adj_amount, 0)       as total_cents,
  coalesce(p.paid, 0)                                                as paid_cents,
  (coalesce(ls.lessons_subtotal, 0) - coalesce(a.adj_amount, 0))
    - coalesce(p.paid, 0)                                            as outstanding_cents
from bills b
left join lesson_sums ls on ls.bill_id = b.id
left join adj_sums    a  on a.bill_id  = b.id
left join pay_sums    p  on p.bill_id  = b.id;

-- -----------------------------------------------------------------------------
-- v_payer_ledger — chronological entries per payer with a running balance.
--   Bills contribute their lessons-only subtotal; adjustments appear as their
--   own lines (whether pending or applied) so nothing is double-counted.
--   Only real charges are included: bills in SENT/PARTIALLY_PAID/PAID
--   (DRAFT and VOID are excluded).
-- -----------------------------------------------------------------------------
create or replace view v_payer_ledger
with (security_invoker = true) as
with entries as (
  select
    b.tutor_id,
    b.payer_id,
    coalesce(b.sent_at, b.created_at)          as entry_at,
    'BILL'::text                               as entry_type,
    b.id                                       as ref_id,
    coalesce(b.period_label, 'Bill')           as description,
    t.lessons_subtotal_cents                   as amount_cents   -- + = owed
  from bills b
  join v_bill_totals t on t.bill_id = b.id
  where b.status in ('SENT','PARTIALLY_PAID','PAID')

  union all
  select
    p.tutor_id, p.payer_id, p.paid_at::timestamptz,
    'PAYMENT', p.id,
    'Payment (' || p.method || ')',
    -p.amount_cents                                              -- reduces owed
  from payments p

  union all
  select
    a.tutor_id, a.payer_id, a.created_at,
    'ADJUSTMENT', a.id,
    a.reason,
    -a.amount_cents                                             -- credit reduces owed
  from adjustments a
)
select
  entries.*,
  sum(amount_cents) over (
    partition by payer_id
    order by entry_at, entry_type, ref_id
    rows between unbounded preceding and current row
  ) as running_balance_cents
from entries;

-- -----------------------------------------------------------------------------
-- v_monthly_summary(tutor, month) — one row for the given tutor & calendar
-- month (month arg: any date within the month, interpreted in SGT).
--   lesson_count        : billable-status lessons in the month.
--   teaching_hours      : hours of COMPLETED lessons (actually taught).
--   earned_income_cents : sum of billable-status lesson amounts (earned basis).
--   billed_cents        : sum of non-void bill totals whose period_start is
--                         in the month.
--   paid_cents          : payments received (paid_at) in the month (cash basis).
--   outstanding_cents   : outstanding on those in-month bills.
-- -----------------------------------------------------------------------------
create or replace function v_monthly_summary(p_tutor uuid, p_month date)
returns table (
  lesson_count        int,
  teaching_hours      numeric,
  earned_income_cents bigint,
  billed_cents        bigint,
  paid_cents          bigint,
  outstanding_cents   bigint
)
language sql stable
set search_path = public, pg_temp
as $$
  with bounds as (
    select date_trunc('month', p_month)::date                        as mstart,
           (date_trunc('month', p_month) + interval '1 month')::date  as mend
  ),
  lz as (
    select l.*
    from lessons l, bounds b
    where l.tutor_id = p_tutor
      and (l.starts_at at time zone 'Asia/Singapore')::date >= b.mstart
      and (l.starts_at at time zone 'Asia/Singapore')::date <  b.mend
  ),
  lesson_stats as (
    select
      count(*) filter (where status in ('COMPLETED','CANCELLED_BILLABLE','NO_SHOW'))::int as lesson_count,
      coalesce(sum(duration_min) filter (where status = 'COMPLETED'), 0) / 60.0           as teaching_hours,
      coalesce(sum(lesson_amount_cents(duration_min, rate_cents))
               filter (where status in ('COMPLETED','CANCELLED_BILLABLE','NO_SHOW')), 0)  as earned
    from lz
  ),
  bill_stats as (
    select coalesce(sum(t.total_cents), 0)       as billed,
           coalesce(sum(t.outstanding_cents), 0) as outstanding
    from bills bb
    join v_bill_totals t on t.bill_id = bb.id, bounds b
    where bb.tutor_id = p_tutor
      and bb.status <> 'VOID'
      and bb.period_start >= b.mstart
      and bb.period_start <  b.mend
  ),
  pay_stats as (
    select coalesce(sum(amount_cents), 0) as paid
    from payments p, bounds b
    where p.tutor_id = p_tutor
      and p.paid_at >= b.mstart
      and p.paid_at <  b.mend
  )
  select ls.lesson_count,
         ls.teaching_hours,
         ls.earned::bigint,
         bs.billed::bigint,
         ps.paid::bigint,
         bs.outstanding::bigint
  from lesson_stats ls, bill_stats bs, pay_stats ps;
$$;

-- -----------------------------------------------------------------------------
-- v_student_summary(student, from, to) — per-student totals over a date range
-- (inclusive, dates interpreted in SGT).
--   billed/paid are attributed to the student by proportional share of each
--   bill that contains this student's lessons (bills can span siblings).
--   distinct_rates_cents : sorted array of rates used by billable lessons.
-- -----------------------------------------------------------------------------
create or replace function v_student_summary(p_student uuid, p_from date, p_to date)
returns table (
  lesson_count         int,
  teaching_hours       numeric,
  earned_income_cents  bigint,
  billed_cents         bigint,
  paid_cents           bigint,
  outstanding_cents    bigint,
  distinct_rates_cents int[]
)
language sql stable
set search_path = public, pg_temp
as $$
  with lz as (
    select l.*
    from lessons l
    join enrollments e on e.id = l.enrollment_id
    where e.student_id = p_student
      and (l.starts_at at time zone 'Asia/Singapore')::date >= p_from
      and (l.starts_at at time zone 'Asia/Singapore')::date <= p_to
  ),
  stats as (
    select
      count(*) filter (where status in ('COMPLETED','CANCELLED_BILLABLE','NO_SHOW'))::int as lesson_count,
      coalesce(sum(duration_min) filter (where status = 'COMPLETED'), 0) / 60.0           as teaching_hours,
      coalesce(sum(lesson_amount_cents(duration_min, rate_cents))
               filter (where status in ('COMPLETED','CANCELLED_BILLABLE','NO_SHOW')), 0)  as earned,
      array_agg(distinct rate_cents order by rate_cents)
               filter (where status in ('COMPLETED','CANCELLED_BILLABLE','NO_SHOW'))      as rates
    from lz
  ),
  -- this student's billed amount per bill (non-void bills, non-free lessons)
  student_bill_amounts as (
    select bl.bill_id,
           sum(lesson_amount_cents(l.duration_min, l.rate_cents)) as student_amount
    from lz l
    join bill_lessons bl on bl.lesson_id = l.id
    join bills b        on b.id = bl.bill_id
    where b.status <> 'VOID'
      and l.status <> 'CANCELLED_FREE'
    group by bl.bill_id
  ),
  alloc as (
    select sba.student_amount,
           case when t.lessons_subtotal_cents > 0
                then sba.student_amount::numeric / t.lessons_subtotal_cents
                else 0 end                       as share,
           t.paid_cents
    from student_bill_amounts sba
    join v_bill_totals t on t.bill_id = sba.bill_id
  ),
  bill_stats as (
    select coalesce(sum(student_amount), 0)              as billed,
           coalesce(sum(round(paid_cents * share)), 0)   as paid
    from alloc
  )
  select s.lesson_count,
         s.teaching_hours,
         s.earned::bigint,
         b.billed::bigint,
         b.paid::bigint,
         (b.billed - b.paid)::bigint,
         coalesce(s.rates, '{}')::int[]
  from stats s, bill_stats b;
$$;
