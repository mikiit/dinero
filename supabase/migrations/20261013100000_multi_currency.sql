-- Multi-currency: an account has one currency (picked when it is created,
-- immutable afterwards - see 20260813140000), and every transaction carries
-- its account's currency. Totals are never converted: they are kept apart per
-- currency, so no exchange rate ever feeds a balance or a report.
--
-- The one place two currencies meet is a transfer between accounts in
-- different currencies. The sender enters both sides ("sent 100 EUR, received
-- 11,700 RSD"); `amount` is what leaves account_id (its currency) and
-- `to_amount` is what arrives in to_account_id (its currency). Storing the
-- received amount instead of a float rate keeps rule 1 (money is bigint) and
-- keeps history stable no matter how rates move later.

-- ---------------------------------------------------------------------------
-- 1. Supported currencies
-- ---------------------------------------------------------------------------
alter table accounts
  add constraint accounts_currency_supported
  check (currency in ('RSD', 'EUR', 'USD', 'AED'));

alter table transactions
  add constraint transactions_currency_supported
  check (currency in ('RSD', 'EUR', 'USD', 'AED'));

-- ---------------------------------------------------------------------------
-- 2. Received amount of a cross-currency transfer
-- ---------------------------------------------------------------------------
alter table transactions
  add column to_amount bigint check (to_amount is null or to_amount > 0);

alter table transactions
  add constraint to_amount_only_for_transfer
  check (to_amount is null or type = 'transfer');

-- A transaction is in its account's currency, and a transfer carries
-- to_amount exactly when the two accounts differ in currency. The app sets
-- all of this already; the trigger is the backstop for any other writer.
create or replace function public.assert_transaction_currency()
returns trigger
language plpgsql
as $$
declare
  src_currency text;
  dst_currency text;
begin
  select currency into src_currency from accounts where id = NEW.account_id;
  if src_currency is distinct from NEW.currency then
    raise exception 'transaction currency % does not match its account currency %',
      NEW.currency, src_currency
      using errcode = '23514';
  end if;

  if NEW.type = 'transfer' then
    select currency into dst_currency from accounts where id = NEW.to_account_id;
    if dst_currency = src_currency and NEW.to_amount is not null then
      raise exception 'to_amount is only for transfers between different currencies'
        using errcode = '23514';
    end if;
    if dst_currency is distinct from src_currency and NEW.to_amount is null then
      raise exception 'a transfer from % to % needs the received amount',
        src_currency, dst_currency
        using errcode = '23514';
    end if;
  end if;

  return NEW;
end;
$$;

create trigger assert_transaction_currency
  before insert or update on transactions
  for each row execute function public.assert_transaction_currency();

-- ---------------------------------------------------------------------------
-- 3. Balances: the destination of a transfer gets to_amount when it is set
-- ---------------------------------------------------------------------------
drop view if exists account_balances;
create view account_balances
with (security_invoker = true)
as
select
  a.id as account_id,
  a.user_id,
  a.space_id,
  a.opening_balance
    + coalesce(sum(
        case
          when t.type = 'income' and t.account_id = a.id then t.amount
          when t.type = 'expense' and t.account_id = a.id then -t.amount
          when t.type = 'transfer' and t.account_id = a.id then -t.amount
          when t.type = 'transfer' and t.to_account_id = a.id then coalesce(t.to_amount, t.amount)
          when t.type = 'adjustment' and t.account_id = a.id then t.amount
          else 0
        end
      ), 0) as balance
from accounts a
left join transactions t
  on (t.account_id = a.id or t.to_account_id = a.id)
  and t.deleted_at is null
group by a.id, a.user_id, a.space_id, a.opening_balance;

grant select on account_balances to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Monthly totals per currency
-- ---------------------------------------------------------------------------
drop view if exists monthly_summary;
create view monthly_summary
with (security_invoker = true)
as
select
  case when t.space_id is null then t.user_id end as user_id,
  t.space_id,
  (date_trunc('month', t.occurred_on::timestamp))::date as month,
  t.currency,
  coalesce(sum(t.amount) filter (where t.type = 'income'), 0) as income,
  coalesce(sum(t.amount) filter (where t.type = 'expense'), 0) as expense
from transactions t
where t.deleted_at is null
  and t.type in ('income', 'expense')
group by
  case when t.space_id is null then t.user_id end,
  t.space_id,
  (date_trunc('month', t.occurred_on::timestamp))::date,
  t.currency;

grant select on monthly_summary to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Budgets are in one currency each
-- ---------------------------------------------------------------------------
-- A category can have a budget per currency per month. Existing budgets are
-- RSD, which is what the column default fills in.
alter table budgets
  add column currency text not null default 'RSD'
  check (currency in ('RSD', 'EUR', 'USD', 'AED'));

drop index if exists budgets_personal_unique;
drop index if exists budgets_space_unique;
create unique index budgets_personal_unique
  on budgets (user_id, category_id, period_month, currency) where space_id is null;
create unique index budgets_space_unique
  on budgets (space_id, category_id, period_month, currency) where space_id is not null;
