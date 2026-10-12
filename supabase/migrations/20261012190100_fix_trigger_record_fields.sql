-- Fixes two PL/pgSQL mistakes in 20261012190000_shared_spaces.sql. Both are
-- the same family of bug (see 20260804190009 for the first time it bit):
-- a trigger function shared by several tables, or by several operations,
-- must not reference a record field that exists for only some of them
-- outside of an explicit guard. PL/pgSQL resolves `NEW.type` against the
-- actual row on every invocation, so
--
--     if TG_TABLE_NAME = 'transactions' and NEW.type in (...) then
--
-- raises 'record "new" has no field "type"' for budgets even though the
-- first condition is false, and `TG_OP = 'DELETE' or NEW.role <> 'owner'`
-- can touch NEW inside a DELETE trigger, where it is unassigned. Boolean
-- short-circuiting is not something SQL promises, so each field access now
-- sits inside its own `if`.
--
-- (The first of these made every INSERT into budgets fail, which is how the
-- live test caught it.) 190000 is already applied, so this is a forward-only
-- CREATE OR REPLACE, exactly as 190009 was.

create or replace function public.assert_account_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  category_kind text;
  who text := case
    when NEW.space_id is null then 'user ' || NEW.user_id
    else 'space ' || NEW.space_id
  end;
begin
  -- Only transactions have accounts, a type and a recurring rule.
  if TG_TABLE_NAME = 'transactions' then
    if not exists (
      select 1 from accounts a
      where a.id = NEW.account_id
        and a.space_id is not distinct from NEW.space_id
        and (NEW.space_id is not null or a.user_id = NEW.user_id)
    ) then
      raise exception 'account % does not belong to %', NEW.account_id, who
        using errcode = '42501';
    end if;

    if NEW.to_account_id is not null and not exists (
      select 1 from accounts a
      where a.id = NEW.to_account_id
        and a.space_id is not distinct from NEW.space_id
        and (NEW.space_id is not null or a.user_id = NEW.user_id)
    ) then
      raise exception 'to_account % does not belong to %', NEW.to_account_id, who
        using errcode = '42501';
    end if;

    if NEW.recurring_id is not null and not exists (
      select 1 from recurring_rules r
      where r.id = NEW.recurring_id
        and r.space_id is not distinct from NEW.space_id
        and (NEW.space_id is not null or r.user_id = NEW.user_id)
    ) then
      raise exception 'recurring rule % does not belong to %', NEW.recurring_id, who
        using errcode = '42501';
    end if;
  end if;

  -- Transactions and budgets both have a category.
  if NEW.category_id is not null then
    select c.kind into category_kind
    from categories c
    where c.id = NEW.category_id
      and c.space_id is not distinct from NEW.space_id
      and (NEW.space_id is not null or c.user_id = NEW.user_id);

    if category_kind is null then
      raise exception 'category % does not belong to %', NEW.category_id, who
        using errcode = '42501';
    end if;

    -- Only transactions have a type; budgets must never reach NEW.type.
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

create or replace function public.assert_space_keeps_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only an owner being removed or demoted can orphan a space.
  if OLD.role <> 'owner' then
    if TG_OP = 'DELETE' then
      return OLD;
    end if;
    return NEW;
  end if;

  if TG_OP = 'UPDATE' then
    -- Still an owner afterwards: nothing to protect. (NEW exists here: this
    -- branch is only reached for UPDATE.)
    if NEW.role = 'owner' then
      return NEW;
    end if;
  end if;

  -- OLD is an owner who is leaving or being demoted. Unless the whole space
  -- is going away (cascade), someone else must remain an owner.
  if exists (select 1 from spaces where id = OLD.space_id)
     and not exists (
       select 1 from space_members
       where space_id = OLD.space_id
         and role = 'owner'
         and user_id <> OLD.user_id
     ) then
    raise exception 'a space must keep at least one owner'
      using errcode = '23514';
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;
