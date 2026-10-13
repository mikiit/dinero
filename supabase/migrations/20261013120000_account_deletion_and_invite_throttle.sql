-- Two launch-hardening pieces:
--   1. A person can erase their own account and everything in it.
--   2. Guessing invite links is throttled, and active invites per space are
--      capped.

-- ---------------------------------------------------------------------------
-- 1. Account deletion
-- ---------------------------------------------------------------------------
-- The data tables carry a user_id with no foreign key to auth.users (so a
-- shared space can outlive the member who created a row), which means
-- deleting the auth user would leave every row behind. This does it
-- explicitly, in dependency order.
--
-- What goes:   the person's personal ledger, spaces that disappear with them
--              (see below), every membership, and the login itself.
-- What stays:  rows they added to a shared space that other people still
--              use. Those belong to the space, not to one member.
--
-- A space disappears with its last person: when they are its only member,
-- or when it was already deleted and they own it. A live space they are the
-- only owner of while others are in it BLOCKS the deletion - ownership must
-- be handed over (or the space deleted) first, otherwise it would be left
-- with nobody in charge.

create or replace function public.account_deletion_check()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  blocked text;
  purge uuid[];
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select coalesce(array_agg(s.id), '{}')
  into purge
  from spaces s
  join space_members m on m.space_id = s.id and m.user_id = uid
  where (s.deleted_at is not null and m.role = 'owner')
     or not exists (
       select 1 from space_members o where o.space_id = s.id and o.user_id <> uid
     );

  select string_agg(s.name, ', ' order by s.name)
  into blocked
  from spaces s
  join space_members m on m.space_id = s.id and m.user_id = uid and m.role = 'owner'
  where s.deleted_at is null
    and exists (select 1 from space_members o where o.space_id = s.id and o.user_id <> uid)
    and not exists (
      select 1 from space_members o
      where o.space_id = s.id and o.user_id <> uid and o.role = 'owner'
    );

  return jsonb_build_object('blocked_by', blocked, 'purge_space_ids', to_jsonb(purge));
end;
$$;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  chk jsonb;
  purge uuid[];
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  chk := public.account_deletion_check();
  if chk ->> 'blocked_by' is not null then
    raise exception 'You own a shared space with other people (%). Make someone else an owner, or delete the space, first.',
      chk ->> 'blocked_by'
      using errcode = 'P0001';
  end if;
  purge := array(select jsonb_array_elements_text(chk -> 'purge_space_ids')::uuid);

  -- Spaces that go away: their data first (transactions reference accounts,
  -- categories and rules), then the space, whose delete cascades to members
  -- and invites.
  delete from transactions   where space_id = any (purge);
  delete from recurring_rules where space_id = any (purge);
  delete from budgets        where space_id = any (purge);
  delete from categories     where space_id = any (purge) and parent_id is not null;
  delete from categories     where space_id = any (purge);
  delete from accounts       where space_id = any (purge);
  delete from spaces         where id = any (purge);

  -- The personal ledger.
  delete from transactions    where user_id = uid and space_id is null;
  delete from recurring_rules where user_id = uid and space_id is null;
  delete from budgets         where user_id = uid and space_id is null;
  delete from categories      where user_id = uid and space_id is null and parent_id is not null;
  delete from categories      where user_id = uid and space_id is null;
  delete from accounts        where user_id = uid and space_id is null;

  -- Leave every space that carries on without them.
  delete from space_members where user_id = uid;
  delete from invite_attempts where user_id = uid;

  -- The login itself (the profile row cascades).
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.account_deletion_check() from public;
revoke all on function public.delete_my_account() from public;
grant execute on function public.account_deletion_check() to authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Invite throttling
-- ---------------------------------------------------------------------------
-- Tokens are 256 bits of randomness, so guessing one is not realistic; this
-- is a second line of defence against someone hammering the endpoint. Failed
-- attempts are recorded per person, and after 10 in 15 minutes further
-- attempts are refused for a while.
--
-- The failure is RETURNED (null), not raised: raising would roll back the
-- row that records it.
create table if not exists invite_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  at timestamptz not null default now()
);
create index if not exists invite_attempts_user_at_idx on invite_attempts (user_id, at);

-- Only the SECURITY DEFINER function below touches this table: RLS on and no
-- policy means nobody else can read or write it.
alter table invite_attempts enable row level security;
revoke all on invite_attempts from anon, authenticated;

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

  if (
    select count(*) from invite_attempts
    where user_id = uid and at > now() - interval '15 minutes'
  ) >= 10 then
    raise exception 'Too many attempts. Please wait a few minutes and try again.'
      using errcode = 'P0001';
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
    -- One answer for every kind of bad invite (unknown, expired, used up,
    -- revoked), so the endpoint reveals nothing about which tokens exist.
    insert into invite_attempts (user_id) values (uid);
    delete from invite_attempts where at < now() - interval '1 day';
    return null;
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

-- A space may not pile up invite links: at most 25 can be live at once.
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
  if (
    select count(*) from space_invites
    where space_id = sid
      and revoked_at is null
      and expires_at > now()
      and used_count < max_uses
  ) >= 25 then
    raise exception 'This space already has 25 active invite links. Revoke some first.'
      using errcode = '23514';
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
