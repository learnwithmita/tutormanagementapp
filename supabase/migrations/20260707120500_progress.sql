-- =============================================================================
-- Milestone 8 — Progress. Two layers:
--   Layer 1  topics + topic_checks  (quick manual syllabus checklist)
--   Layer 2  work_items (Notes/Practice) + practice_papers  (in-depth work log)
-- Checkboxes and work items are linked only visually (badges); neither ever
-- auto-toggles the other. tutor_id + RLS on every table (tutor_id = auth.uid()).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type work_item_type as enum ('NOTES', 'PRACTICE');

-- One status enum spanning both work_items and practice_papers. NOTES rows are
-- restricted (by CHECK) to NOT_STARTED / IN_PROGRESS / COMPLETED.
create type progress_status as enum (
  'NOT_STARTED', 'IN_PROGRESS', 'DONE', 'MARKED', 'COMPLETED'
);

-- -----------------------------------------------------------------------------
-- topics — the tutor's syllabus, keyed by (level, subject). level/subject are
-- exact trimmed matches against enrollments.level / enrollments.subject.
-- -----------------------------------------------------------------------------
create table topics (
  id          uuid primary key default gen_random_uuid(),
  tutor_id    uuid not null references tutors(id),
  level       text not null,
  subject     text not null,
  name        text not null,
  sort_order  int  not null,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_topics_tutor_syllabus on topics(tutor_id, level, subject);
-- Unique topic name (case-insensitive) per syllabus, among non-archived rows.
create unique index uq_topics_name
  on topics(tutor_id, level, subject, lower(name))
  where archived_at is null;

-- -----------------------------------------------------------------------------
-- topic_checks — Layer 1. Created lazily on first check/remark.
-- -----------------------------------------------------------------------------
create table topic_checks (
  id            uuid primary key default gen_random_uuid(),
  tutor_id      uuid not null references tutors(id),
  enrollment_id uuid not null references enrollments(id),
  topic_id      uuid not null references topics(id),
  checked       boolean not null default true,
  checked_at    date,
  remark        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (enrollment_id, topic_id)
);
create index idx_topic_checks_enrollment on topic_checks(enrollment_id);
create index idx_topic_checks_topic on topic_checks(topic_id);

-- -----------------------------------------------------------------------------
-- work_items — Layer 2 (Notes and Practice). Always assigned to a topic.
--   NOTES:    NOT_STARTED -> IN_PROGRESS -> COMPLETED
--   PRACTICE: NOT_STARTED -> IN_PROGRESS -> DONE -> MARKED -> COMPLETED
-- Dates are stamped by the app on transitions and remain editable.
-- -----------------------------------------------------------------------------
create table work_items (
  id            uuid primary key default gen_random_uuid(),
  tutor_id      uuid not null references tutors(id),
  enrollment_id uuid not null references enrollments(id),
  type          work_item_type not null,
  topic_id      uuid not null references topics(id),
  title         text,
  status        progress_status not null default 'NOT_STARTED',
  started_at    date,
  completed_at  date,
  remark        text,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- NOTES can never be DONE or MARKED.
  constraint work_items_notes_stage_ck
    check (type <> 'NOTES' or status not in ('DONE', 'MARKED')),
  -- completed cannot precede started.
  constraint work_items_dates_ck
    check (completed_at is null or started_at is null or completed_at >= started_at)
);
create index idx_work_items_enrollment on work_items(enrollment_id);
create index idx_work_items_topic on work_items(topic_id);
create index idx_work_items_queue on work_items(tutor_id, status)
  where type = 'PRACTICE' and archived_at is null;

-- -----------------------------------------------------------------------------
-- practice_papers — Layer 2 (Papers). NOT assigned to a topic. Duplicates
-- allowed on purpose (re-attempts). Same 5-stage lifecycle.
-- -----------------------------------------------------------------------------
create table practice_papers (
  id            uuid primary key default gen_random_uuid(),
  tutor_id      uuid not null references tutors(id),
  enrollment_id uuid not null references enrollments(id),
  school        text not null,
  level         text not null,        -- defaults to enrolment level, editable
  exam_type     text not null,        -- WA1, WA2, Mid-Year, Prelim, …
  year          int  not null check (year between 2000 and 2100),
  status        progress_status not null default 'NOT_STARTED',
  started_at    date,
  completed_at  date,
  score         numeric,
  max_score     numeric,
  remark        text,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- score/max: both null or both set; 0 <= score <= max; max > 0.
  constraint papers_score_ck check (
    (score is null and max_score is null)
    or (score is not null and max_score is not null
        and score >= 0 and max_score > 0 and score <= max_score)
  ),
  constraint papers_dates_ck
    check (completed_at is null or started_at is null or completed_at >= started_at)
);
create index idx_papers_enrollment on practice_papers(enrollment_id);
create index idx_papers_queue on practice_papers(tutor_id, status)
  where archived_at is null;

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['topics','topic_checks','work_items','practice_papers'] loop
    execute format(
      'create trigger trg_%1$s_updated_at before update on %1$s
       for each row execute function set_updated_at()', t);
  end loop;
end$$;

-- =============================================================================
-- Views (security_invoker so per-tutor RLS applies).
-- =============================================================================

-- Layer 1 progress per enrolment. Archived topics leave both numerator and
-- denominator, so archiving never drops anyone's percentage.
create or replace view v_enrollment_checklist
with (security_invoker = true) as
select
  e.id       as enrollment_id,
  e.tutor_id,
  count(t.id)                                   as total_topics,
  count(t.id) filter (where tc.checked)         as checked_topics,
  case when count(t.id) = 0 then 0
       else round(count(t.id) filter (where tc.checked)::numeric * 100 / count(t.id))
  end        as pct
from enrollments e
left join topics t
  on t.tutor_id = e.tutor_id
 and t.level = e.level
 and t.subject = e.subject
 and t.archived_at is null
left join topic_checks tc
  on tc.topic_id = t.id
 and tc.enrollment_id = e.id
group by e.id, e.tutor_id;

-- Badge counts per (enrollment, topic) driving the checklist badges.
create or replace view v_topic_workitem_badges
with (security_invoker = true) as
select
  enrollment_id,
  topic_id,
  count(*) filter (where type = 'NOTES')                              as notes_total,
  count(*) filter (where type = 'NOTES'    and status = 'IN_PROGRESS') as notes_in_progress,
  count(*) filter (where type = 'NOTES'    and status = 'COMPLETED')   as notes_completed,
  count(*) filter (where type = 'PRACTICE')                           as practice_total,
  count(*) filter (where type = 'PRACTICE' and status = 'IN_PROGRESS') as practice_in_progress,
  count(*) filter (where type = 'PRACTICE' and status = 'DONE')        as practice_done,
  count(*) filter (where type = 'PRACTICE' and status = 'MARKED')      as practice_marked,
  count(*) filter (where type = 'PRACTICE' and status = 'COMPLETED')   as practice_completed
from work_items
where archived_at is null
group by enrollment_id, topic_id;

-- Paper stats per enrolment over scored papers (percentage = score/max*100).
create or replace view v_enrollment_papers
with (security_invoker = true) as
with pp as (
  select *,
    case when score is not null and max_score > 0 then score / max_score * 100 end as pct
  from practice_papers
  where archived_at is null
)
select
  enrollment_id,
  count(*)                                                       as papers_total,
  count(*) filter (where status = 'COMPLETED')                  as papers_completed,
  round(avg(pct) filter (where pct is not null))                as avg_pct,
  round(max(pct) filter (where pct is not null))                as best_pct,
  (array_agg(pct order by started_at desc nulls last, created_at desc)
     filter (where pct is not null))[1]                          as latest_pct
from pp
group by enrollment_id;

-- Marking queue across the roster: every PRACTICE work item and practice paper
-- currently DONE or MARKED. days_in_status uses updated_at as the last change.
create or replace view v_marking_queue
with (security_invoker = true) as
select
  wi.tutor_id,
  'WORK_ITEM'::text                              as kind,
  wi.id                                          as item_id,
  wi.enrollment_id,
  s.name                                         as student_name,
  e.level,
  e.subject,
  coalesce(nullif(btrim(wi.title), ''), t.name || ' Practice') as label,
  wi.status,
  (current_date - (wi.updated_at at time zone 'Asia/Singapore')::date) as days_in_status
from work_items wi
join enrollments e on e.id = wi.enrollment_id
join students s on s.id = e.student_id
join topics t on t.id = wi.topic_id
where wi.type = 'PRACTICE' and wi.status in ('DONE', 'MARKED') and wi.archived_at is null
union all
select
  pp.tutor_id,
  'PAPER',
  pp.id,
  pp.enrollment_id,
  s.name,
  e.level,
  e.subject,
  pp.school || ' ' || pp.level || ' ' || pp.exam_type || ' ' || pp.year::text,
  pp.status,
  (current_date - (pp.updated_at at time zone 'Asia/Singapore')::date)
from practice_papers pp
join enrollments e on e.id = pp.enrollment_id
join students s on s.id = e.student_id
where pp.status in ('DONE', 'MARKED') and pp.archived_at is null;

-- =============================================================================
-- RLS — enabled + forced; per-tutor isolation.
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array['topics','topic_checks','work_items','practice_papers'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy tutor_isolation on %I
         for all using (tutor_id = auth.uid()) with check (tutor_id = auth.uid())', t);
  end loop;
end$$;
