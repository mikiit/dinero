-- Shared spaces (SPEC.md Phase 4): a space is a SEPARATE LEDGER that several
-- people share - its own accounts, categories, transactions, budgets and
-- recurring rules - with roles owner / editor / viewer. Personal data is
-- untouched: a row with space_id NULL is personal and, exactly as before,
-- visible only to the user who owns it.
--
-- Model, in one line per rule (each is enforced below, in the database):
--   * space_id IS NULL      -> personal row; only user_id = auth.uid() sees/edits it.
--   * space_id IS NOT NULL  -> space row; any member sees it, owners and
--                              editors write it, viewers only read.
--   * user_id on a space row is the CREATOR, never an access check.
--   * A row can only reference rows from its own ledger (a space transaction
--     cannot point at a personal account, nor at another space's category).
--   * Rows never move between ledgers.
--
-- Safe to run by hand in the SQL editor and again via `supabase db push`
-- (everything is IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS).

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table spaces enable row level security;

create table if not exists space_members (
  space_id uuid not null references spaces (id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);
create index if not exists space_members_user_id_idx on space_members (user_id);
alter table space_members enable row level security;

-- Invite links. Only a HASH of the token is stored, so a database leak does
-- not leak working invites; the plain token exists once, in the link the
-- owner copies.
create table if not exists space_invites (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces (id) on delete cascade,
  token_hash text not null unique,
  role text not null check (role in ('editor', 'viewer')),
  created_by uuid not null default auth.uid(),
  expires_at timestamptz not null,
  max_uses int not null default 1 check (max_uses > 0),
  used_count int not null default 0 check (used_count >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists space_invites_space_id_idx on space_invites (space_id);
alter table space_invites enable row level security;

-- ---------------------------------------------------------------------------
-- 2. The role lookup every policy uses
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so it can read space_members without going through that
-- table's own RLS (which itself calls it - this breaks the recursion). It
-- only ever answers about auth.uid(), so it can't be used to probe others.
-- A soft-deleted space yields NULL, i.e. its data disappears for everyone.
create or replace function public.space_role(sid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from space_members m
  join spaces s on s.id = m.space_id
  where m.space_id = sid
    and m.user_id = (select auth.uid())
    and s.deleted_at is null
$$;

revoke all on function public.space_role(uuid) from public;
grant execute on function public.space_role(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Policies on the three new tables
-- ---------------------------------------------------------------------------

drop policy if exists "spaces_select_member" on spaces;
create policy "spaces_select_member" on spaces
  for select to authenticated
  using (public.space_role(id) is not null);

drop policy if exists "spaces_update_owner" on spaces;
create policy "spaces_update_owner" on spaces
  for update to authenticated
  using (public.space_role(id) = 'owner')
  with check (public.space_role(id) = 'owner');
-- No INSERT / DELETE policy on purpose: spaces are created through
-- create_space() (which also makes the creator the owner, atomically) and
-- are soft-deleted via deleted_at.

drop policy if exists "space_members_select_member" on space_members;
create policy "space_members_select_member" on space_members
  for select to authenticated
  using (public.space_role(space_id) is not null);

drop policy if exists "space_members_update_owner" on space_members;
create policy "space_members_update_owner" on space_members
  for update to authenticated
  using (public.space_role(space_id) = 'owner')
  with check (public.space_role(space_id) = 'owner');

-- An owner can remove anyone; anyone can remove themselves (leave).
drop policy if exists "space_members_delete_owner_or_self" on space_members;
create policy "space_members_delete_owner_or_self" on space_members
  for delete to authenticated
  using (
    public.space_role(space_id) = 'owner'
    or user_id = (select auth.uid())
  );
-- No INSERT policy: members are added only by accept_space_invite().

drop policy if exists "space_invites_select_owner" on space_invites;
create policy "space_invites_select_owner" on space_invites
  for select to authenticated
  using (public.space_role(space_id) = 'owner');

-- Owners can revoke (set revoked_at). Creating and consuming happen in the
-- functions below.
drop policy if exists "space_invites_update_owner" on space_invites;
create policy "space_invites_update_owner" on space_invites
  for update to authenticated
  using (public.space_role(space_id) = 'owner')
  with check (public.space_role(space_id) = 'owner');

-- A space must always keep an owner: otherwise nobody could manage it.
create or replace function public.assert_space_keeps_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if OLD.role = 'owner'
     and (TG_OP = 'DELETE' or NEW.role <> 'owner')
     -- When the whole space is being removed (cascade), nothing to protect.
     and exists (select 1 from spaces where id = OLD.space_id)
     and not exists (
       select 1 from space_members
       where space_id = OLD.space_id
         and role = 'owner'
         and user_id <> OLD.user_id
     ) then
    raise exception 'a space must keep at least one owner'
      using errcode = '23514';
  end if;
  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

drop trigger if exists assert_space_keeps_owner on space_members;
create trigger assert_space_keeps_owner
  before update or delete on space_members
  for each row execute function public.assert_space_keeps_owner();

-- ---------------------------------------------------------------------------
-- 4. Ledger scope on the five data tables
-- ---------------------------------------------------------------------------

alter table accounts        add column if not exists space_id uuid references spaces (id);
alter table categories      add column if not exists space_id uuid references spaces (id);
alter table transactions    add column if not exists space_id uuid references spaces (id);
alter table budgets         add column if not exists space_id uuid references spaces (id);
alter table recurring_rules add column if not exists space_id uuid references spaces (id);

create index if not exists accounts_space_id_idx        on accounts (space_id)        where space_id is not null;
create index if not exists categories_space_id_idx      on categories (space_id)      where space_id is not null;
create index if not exists transactions_space_id_idx    on transactions (space_id, occurred_on desc) where space_id is not null;
create index if not exists budgets_space_id_idx         on budgets (space_id)         where space_id is not null;
create index if not exists recurring_rules_space_id_idx on recurring_rules (space_id) where space_id is not null;

-- Budgets were unique per (user, category, month). In a space the budget
-- belongs to the SPACE, so it must be unique per (space, category, month):
-- keyed by user instead, two members could each set a different budget for
-- the same category and the report would silently pick one. Personal budgets
-- keep the old rule. (These are partial indexes, so the app writes budgets
-- with update-then-insert rather than an ON CONFLICT upsert.)
alter table budgets drop constraint if exists budgets_user_id_category_id_period_month_key;
create unique index if not exists budgets_personal_unique
  on budgets (user_id, category_id, period_month) where space_id is null;
create unique index if not exists budgets_space_unique
  on budgets (space_id, category_id, period_month) where space_id is not null;

-- ---------------------------------------------------------------------------
-- 5. RLS on the data tables: personal-or-member, split by operation
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'categories', 'transactions', 'budgets', 'recurring_rules']
  loop
    execute format('drop policy if exists "own rows" on %I', t);
    execute format('drop policy if exists "ledger_select" on %I', t);
    execute format('drop policy if exists "ledger_insert" on %I', t);
    execute format('drop policy if exists "ledger_update" on %I', t);
    execute format('drop policy if exists "ledger_delete" on %I', t);

    -- See: your own personal rows, and every row of a space you belong to.
    execute format($p$
      create policy "ledger_select" on %I for select to authenticated
      using (
        (space_id is null and user_id = (select auth.uid()))
        or (space_id is not null and public.space_role(space_id) is not null)
      )$p$, t);

    -- Create: as yourself; in a space only as owner or editor.
    execute format($p$
      create policy "ledger_insert" on %I for insert to authenticated
      with check (
        user_id = (select auth.uid())
        and (space_id is null or public.space_role(space_id) in ('owner', 'editor'))
      )$p$, t);

    -- Change: your personal rows; space rows as owner or editor (whoever
    -- created them - a partner must be able to fix your typo).
    execute format($p$
      create policy "ledger_update" on %I for update to authenticated
      using (
        (space_id is null and user_id = (select auth.uid()))
        or (space_id is not null and public.space_role(space_id) in ('owner', 'editor'))
      )
      with check (
        (space_id is null and user_id = (select auth.uid()))
        or (space_id is not null and public.space_role(space_id) in ('owner', 'editor'))
      )$p$, t);

    execute format($p$
      create policy "ledger_delete" on %I for delete to authenticated
      using (
        (space_id is null and user_id = (select auth.uid()))
        or (space_id is not null and public.space_role(space_id) in ('owner', 'editor'))
      )$p$, t);
  end loop;
end
$$;

-- A row never moves to another ledger and never changes creator: neither is
-- something an editor's UPDATE permission should include.
create or replace function public.prevent_scope_change()
returns trigger
language plpgsql
as $$
begin
  if NEW.space_id is distinct from OLD.space_id then
    raise exception 'a row cannot be moved between ledgers (%.%)', TG_TABLE_NAME, OLD.id
      using errcode = '23514';
  end if;
  if NEW.user_id <> OLD.user_id then
    raise exception 'the creator of a row cannot be changed (%.%)', TG_TABLE_NAME, OLD.id
      using errcode = '23514';
  end if;
  return NEW;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'categories', 'transactions', 'budgets', 'recurring_rules']
  loop
    execute format('drop trigger if exists prevent_scope_change on %I', t);
    execute format(
      'create trigger prevent_scope_change before update on %I for each row execute function public.prevent_scope_change()',
      t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Referenced rows must be in the SAME ledger
-- ---------------------------------------------------------------------------
-- Replaces the user-ownership check from 20260804190008. Same function and
-- trigger names, same error codes and (for personal rows) same messages, so
-- everything that relied on them keeps working. Still SECURITY DEFINER with
-- explicit comparisons rather than leaning on RLS (see that file's header).
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

-- A category's parent must be in the same ledger, too.
create or replace function public.assert_category_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_id_of_parent uuid;
  parent_kind text;
  has_own_children boolean;
begin
  if NEW.parent_id is null then
    return NEW;
  end if;

  if NEW.parent_id = NEW.id then
    raise exception 'a category cannot be its own parent (%)', NEW.id
      using errcode = '23514';
  end if;

  select c.parent_id, c.kind into parent_id_of_parent, parent_kind
  from categories c
  where c.id = NEW.parent_id
    and c.space_id is not distinct from NEW.space_id
    and (NEW.space_id is not null or c.user_id = NEW.user_id);

  if parent_kind is null then
    raise exception 'parent category % does not belong to %', NEW.parent_id,
      case when NEW.space_id is null then 'user ' || NEW.user_id else 'space ' || NEW.space_id end
      using errcode = '42501';
  end if;

  if parent_id_of_parent is not null then
    raise exception 'categories are two levels deep - % already has a parent', NEW.parent_id
      using errcode = '23514';
  end if;

  if parent_kind <> NEW.kind then
    raise exception 'category kind % does not match parent kind %', NEW.kind, parent_kind
      using errcode = '23514';
  end if;

  select exists(select 1 from categories where parent_id = NEW.id) into has_own_children;
  if has_own_children then
    raise exception 'category % already has children and cannot become a child itself', NEW.id
      using errcode = '23514';
  end if;

  return NEW;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Views: carry the ledger, aggregate a space across its members
-- ---------------------------------------------------------------------------
-- Both stay security_invoker, so the caller's RLS decides which rows feed
-- them. For a space the totals must span every member's rows, so user_id is
-- NULL there and the row is keyed by space_id; personal rows are unchanged.

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
          when t.type = 'transfer' and t.to_account_id = a.id then t.amount
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

drop view if exists monthly_summary;
create view monthly_summary
with (security_invoker = true)
as
select
  case when t.space_id is null then t.user_id end as user_id,
  t.space_id,
  (date_trunc('month', t.occurred_on::timestamp))::date as month,
  coalesce(sum(t.amount) filter (where t.type = 'income'), 0) as income,
  coalesce(sum(t.amount) filter (where t.type = 'expense'), 0) as expense
from transactions t
where t.deleted_at is null
  and t.type in ('income', 'expense')
group by
  case when t.space_id is null then t.user_id end,
  t.space_id,
  (date_trunc('month', t.occurred_on::timestamp))::date;

grant select on monthly_summary to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Receipts: a space's receipts live in a folder named after the SPACE
-- ---------------------------------------------------------------------------
-- (Personal receipts stay in "<user_id>/...".) Members of the space can read
-- them; owners and editors can add or remove them.
create or replace function public.can_access_receipt_folder(folder text, for_write boolean)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select folder = (select auth.uid())::text
    or exists (
      select 1
      from space_members m
      join spaces s on s.id = m.space_id
      where m.space_id::text = folder
        and m.user_id = (select auth.uid())
        and s.deleted_at is null
        and (not for_write or m.role in ('owner', 'editor'))
    )
$$;

revoke all on function public.can_access_receipt_folder(text, boolean) from public;
grant execute on function public.can_access_receipt_folder(text, boolean) to authenticated;

drop policy if exists "receipts_select_own" on storage.objects;
create policy "receipts_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and public.can_access_receipt_folder((storage.foldername(name))[1], false)
  );

drop policy if exists "receipts_insert_own" on storage.objects;
create policy "receipts_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and public.can_access_receipt_folder((storage.foldername(name))[1], true)
  );

drop policy if exists "receipts_delete_own" on storage.objects;
create policy "receipts_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'receipts'
    and public.can_access_receipt_folder((storage.foldername(name))[1], true)
  );

-- ---------------------------------------------------------------------------
-- 9. Functions the app calls (the only way to create a space, invite, join)
-- ---------------------------------------------------------------------------

create or replace function public.create_space(space_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  sid uuid;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  -- A shared ledger tied to a throwaway browser session would be lost with
  -- it; require a real account.
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'create an account before creating a shared space' using errcode = '42501';
  end if;

  insert into spaces (name, created_by) values (btrim(space_name), uid) returning id into sid;
  insert into space_members (space_id, user_id, role) values (sid, uid, 'owner');
  return sid;
end;
$$;

-- Returns the PLAIN token once; only its hash is stored.
create or replace function public.create_space_invite(
  sid uuid,
  invite_role text,
  valid_hours int default 168,
  uses int default 1
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if public.space_role(sid) is distinct from 'owner' then
    raise exception 'only an owner can invite people' using errcode = '42501';
  end if;
  if invite_role not in ('editor', 'viewer') then
    raise exception 'invite role must be editor or viewer' using errcode = '23514';
  end if;
  if valid_hours < 1 or valid_hours > 24 * 30 then
    raise exception 'an invite must be valid for 1 hour to 30 days' using errcode = '23514';
  end if;
  if uses < 1 or uses > 20 then
    raise exception 'an invite can be used 1 to 20 times' using errcode = '23514';
  end if;

  insert into space_invites (space_id, token_hash, role, created_by, expires_at, max_uses)
  values (
    sid,
    encode(sha256(convert_to(token, 'utf8')), 'hex'),
    invite_role,
    auth.uid(),
    now() + make_interval(hours => valid_hours),
    uses
  );
  return token;
end;
$$;

-- One generic error for every kind of bad invite, so the endpoint can't be
-- used to find out which tokens exist, expired, or were used up.
create or replace function public.accept_space_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  inv space_invites%rowtype;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'create an account before joining a shared space' using errcode = '42501';
  end if;

  select i.* into inv
  from space_invites i
  join spaces s on s.id = i.space_id
  where i.token_hash = encode(sha256(convert_to(invite_token, 'utf8')), 'hex')
    and i.revoked_at is null
    and i.expires_at > now()
    and i.used_count < i.max_uses
    and s.deleted_at is null
  for update of i;

  if not found then
    raise exception 'This invite is not valid.' using errcode = 'P0001';
  end if;

  -- Already a member: nothing to consume, and never downgrade an existing role.
  if exists (select 1 from space_members where space_id = inv.space_id and user_id = uid) then
    return inv.space_id;
  end if;

  insert into space_members (space_id, user_id, role) values (inv.space_id, uid, inv.role);
  update space_invites set used_count = used_count + 1 where id = inv.id;
  return inv.space_id;
end;
$$;

-- Members of a space may see who else is in it (email, role) - and nothing
-- else about anyone: auth.users itself is not exposed.
create or replace function public.list_space_members(sid uuid)
returns table (user_id uuid, role text, email text, is_you boolean)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, m.role, u.email::text, m.user_id = (select auth.uid())
  from space_members m
  join auth.users u on u.id = m.user_id
  where m.space_id = sid
    and public.space_role(sid) is not null
  order by case m.role when 'owner' then 0 when 'editor' then 1 else 2 end, u.email
$$;

revoke all on function public.create_space(text) from public;
revoke all on function public.create_space_invite(uuid, text, int, int) from public;
revoke all on function public.accept_space_invite(text) from public;
revoke all on function public.list_space_members(uuid) from public;
grant execute on function public.create_space(text) to authenticated;
grant execute on function public.create_space_invite(uuid, text, int, int) to authenticated;
grant execute on function public.accept_space_invite(text) to authenticated;
grant execute on function public.list_space_members(uuid) to authenticated;
