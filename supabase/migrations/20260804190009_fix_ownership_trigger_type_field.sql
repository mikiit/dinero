-- 20260804190008's category-kind check combined TG_TABLE_NAME = 'transactions'
-- and NEW.type into a single boolean expression:
--
--   if TG_TABLE_NAME = 'transactions' and NEW.type in (...) and ... then
--
-- For a trigger function shared across tables, NEW's row type is only known
-- per invocation, so PL/pgSQL must resolve NEW.type against the actual row
-- before the AND can short-circuit — and budgets has no `type` column, so
-- every budget insert/update failed with "record \"new\" has no field
-- \"type\"" (42703), regardless of category ownership. Confirmed live via
-- lib/db/ownership-triggers.test.ts before writing this fix.
--
-- 190008 is already applied, so this is a forward-only replace rather than
-- an edit — same create-or-replace idiom 190008 itself used. The fix nests
-- the type check inside its own `if TG_TABLE_NAME = 'transactions'` block,
-- matching the pattern the account_id/to_account_id checks already used
-- correctly in the same function.
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

    if TG_TABLE_NAME = 'transactions' then
      if NEW.type in ('expense', 'income') and category_kind <> NEW.type then
        raise exception 'category kind % does not match transaction type %', category_kind, NEW.type
          using errcode = '23514';
      end if;
    end if;
  end if;

  return NEW;
end;
$$;
