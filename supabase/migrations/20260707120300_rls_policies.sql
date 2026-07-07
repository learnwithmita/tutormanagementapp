-- =============================================================================
-- Milestone 1 — Row Level Security. RLS ON for every table. Every row is owned
-- by exactly one tutor; all access is restricted to that tutor.
--   * tutors: the row whose id = auth.uid().
--   * every other table: rows where tutor_id = auth.uid().
-- One FOR ALL policy per table covers select/insert/update/delete (USING gates
-- read/update/delete; WITH CHECK gates insert/update).
-- =============================================================================

-- Enable + force RLS on every table.
do $$
declare t text;
begin
  foreach t in array array[
    'tutors','payers','students','enrollments','recurring_schedules',
    'lessons','bills','bill_lessons','payments','adjustments','receipts'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end$$;

-- tutors — keyed on id.
create policy tutor_self on tutors
  for all
  using (id = auth.uid())
  with check (id = auth.uid());

-- Everyone else — keyed on tutor_id.
do $$
declare t text;
begin
  foreach t in array array[
    'payers','students','enrollments','recurring_schedules',
    'lessons','bills','bill_lessons','payments','adjustments','receipts'
  ] loop
    execute format(
      'create policy tutor_isolation on %I
         for all
         using (tutor_id = auth.uid())
         with check (tutor_id = auth.uid())', t);
  end loop;
end$$;
