-- =============================================================================
-- Milestone 3 — v_payer_balances: current balance per payer (positive = owes).
-- Derived from the ledger so it accounts for bills, payments and adjustments.
-- =============================================================================
create or replace view v_payer_balances
with (security_invoker = true) as
select
  p.id       as payer_id,
  p.tutor_id,
  coalesce(
    (select sum(l.amount_cents) from v_payer_ledger l where l.payer_id = p.id),
    0
  )::bigint  as balance_cents
from payers p;
