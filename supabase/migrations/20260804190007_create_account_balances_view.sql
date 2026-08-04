-- The only source of account balances in the app (CLAUDE.md rule 2:
-- balances are derived, never stored — no balance math belongs in
-- TypeScript). Reads opening_balance + sum(transactions), signed per
-- SPEC.md Sec3: income/adjustment add, expense subtracts, transfer
-- subtracts from account_id and adds to to_account_id. Soft-deleted
-- transactions (deleted_at) are excluded.
--
-- security_invoker makes the view run with the querying role's own
-- permissions, so it's subject to the same RLS policies as the underlying
-- accounts/transactions tables instead of the view owner's — without this
-- a view silently bypasses RLS.
create view account_balances
with (security_invoker = true)
as
select
  a.id as account_id,
  a.user_id,
  a.opening_balance
    + coalesce(sum(
        case
          when t.type = 'income' and t.account_id = a.id then t.amount
          when t.type = 'expense' and t.account_id = a.id then -t.amount
          when t.type = 'transfer' and t.account_id = a.id then -t.amount
          when t.type = 'transfer' and t.to_account_id = a.id then t.amount
          when t.type = 'adjustment' and t.account_id = a.id then t.amount
          else 0
        end
      ), 0) as balance
from accounts a
left join transactions t
  on (t.account_id = a.id or t.to_account_id = a.id)
  and t.deleted_at is null
group by a.id, a.user_id, a.opening_balance;

grant select on account_balances to authenticated;
