-- Per-user, per-month income/expense totals, for the Home dashboard's
-- "this month's income/expense/net". Like account_balances, this is a
-- display aggregate computed in SQL rather than summing raw transaction
-- rows in TypeScript (CLAUDE.md rule 2) - "this month" changes daily, but
-- a view is just a stored query, re-evaluated on every SELECT, so it
-- doesn't need to be recreated to stay current. The app filters to the
-- current month with a normal .eq() on top of this, the same way
-- account_balances's per-account rows get filtered by account_id.
create view monthly_summary
with (security_invoker = true)
as
select
  t.user_id,
  (date_trunc('month', t.occurred_on::timestamp))::date as month,
  coalesce(sum(t.amount) filter (where t.type = 'income'), 0) as income,
  coalesce(sum(t.amount) filter (where t.type = 'expense'), 0) as expense
from transactions t
where t.deleted_at is null
  and t.type in ('income', 'expense')
group by t.user_id, (date_trunc('month', t.occurred_on::timestamp))::date;

grant select on monthly_summary to authenticated;
