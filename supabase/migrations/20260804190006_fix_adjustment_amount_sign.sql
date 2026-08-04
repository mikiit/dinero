-- The amount > 0 check on transactions (20260804190004) was too strict:
-- expense/income/transfer are correctly unsigned with direction derived
-- from type + account role, but an 'adjustment' ("Set current balance")
-- needs to move the balance in either direction and has no other column to
-- carry that sign. Without this fix, a downward balance correction would
-- have been impossible to write. 20260804190004 is already applied to the
-- remote project, so this is a forward-only alter rather than an edit.
--
-- The original check was an unnamed column constraint, so its
-- auto-generated name is looked up dynamically instead of assumed.
do $$
declare
  amount_check_name text;
begin
  select con.conname into amount_check_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_attribute att
    on att.attrelid = rel.oid and att.attnum = any (con.conkey)
  where rel.relname = 'transactions'
    and con.contype = 'c'
    and array_length(con.conkey, 1) = 1
    and att.attname = 'amount';

  if amount_check_name is not null then
    execute format('alter table transactions drop constraint %I', amount_check_name);
  end if;
end $$;

alter table transactions
  add constraint amount_sign_matches_type check (
    (type = 'adjustment' and amount <> 0)
    or (type <> 'adjustment' and amount > 0)
  );
