-- Closes a gap RLS alone doesn't cover: a foreign key only checks that the
-- referenced row *exists*, not that it's owned by the same user. Without
-- this, session B could write a transaction with its own user_id but an
-- account_id (or category_id) belonging to session A — RLS on `accounts`
-- would even let this slip through implicitly (B's own-rows policy would
-- just hide the row from B's later reads, but the FK check that runs at
-- INSERT time bypasses RLS entirely and only confirms the row exists).
--
-- security definer + explicit user_id comparisons rather than relying on
-- the interaction between this table's RLS and accounts/categories' RLS,
-- so this stays correct even if a later phase (shared spaces, SPEC.md
-- Phase 4) loosens who can SELECT an account or category.
create or replace function public.assert_account_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  category_kind text;
begin
  if TG_TABLE_NAME = 'transactions' then
    if not exists (
      select 1 from accounts
      where id = NEW.account_id and user_id = NEW.user_id
    ) then
      raise exception 'account % does not belong to user %', NEW.account_id, NEW.user_id
        using errcode = '42501';
    end if;

    if NEW.to_account_id is not null and not exists (
      select 1 from accounts
      where id = NEW.to_account_id and user_id = NEW.user_id
    ) then
      raise exception 'to_account % does not belong to user %', NEW.to_account_id, NEW.user_id
        using errcode = '42501';
    end if;
  end if;

  if NEW.category_id is not null then
    select kind into category_kind
    from categories
    where id = NEW.category_id and user_id = NEW.user_id;

    if category_kind is null then
      raise exception 'category % does not belong to user %', NEW.category_id, NEW.user_id
        using errcode = '42501';
    end if;

    if TG_TABLE_NAME = 'transactions'
       and NEW.type in ('expense', 'income')
       and category_kind <> NEW.type then
      raise exception 'category kind % does not match transaction type %', category_kind, NEW.type
        using errcode = '23514';
    end if;
  end if;

  return NEW;
end;
$$;

create trigger assert_account_ownership_transactions
  before insert or update on transactions
  for each row execute function public.assert_account_ownership();

create trigger assert_account_ownership_budgets
  before insert or update on budgets
  for each row execute function public.assert_account_ownership();
