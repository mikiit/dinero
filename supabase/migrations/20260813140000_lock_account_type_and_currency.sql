-- account type and currency are immutable after creation: type drives the
-- balance sign convention and which fields apply (credit vs cash/debit/
-- savings), and currency changing after transactions exist would silently
-- reinterpret every past amount in a different currency. Changing either
-- should mean creating a new account, not editing this one.
--
-- A CHECK constraint can't compare OLD vs NEW, so this needs a trigger.
-- SECURITY INVOKER (the default) is enough here - unlike the ownership
-- trigger, this only compares the row being updated against itself and
-- doesn't need to see past what RLS already allows the caller to touch.
create or replace function public.prevent_account_type_currency_change()
returns trigger
language plpgsql
as $$
begin
  if NEW.type <> OLD.type then
    raise exception 'account type cannot be changed after creation (account %)', OLD.id
      using errcode = '23514';
  end if;

  if NEW.currency <> OLD.currency then
    raise exception 'account currency cannot be changed after creation (account %)', OLD.id
      using errcode = '23514';
  end if;

  return NEW;
end;
$$;

create trigger prevent_account_type_currency_change
  before update on accounts
  for each row execute function public.prevent_account_type_currency_change();
