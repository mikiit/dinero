-- profiles: mirrors auth.users, one row per person.
-- Even single-user, this ships with RLS from day one (CLAUDE.md rule 3).
create extension if not exists pgcrypto;

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  base_currency text not null default 'RSD',
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "own rows" on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- Auto-provisions a profile row for every new auth.users row, anonymous or
-- real (SPEC.md: single-user phase uses an anonymous session so RLS is
-- actually enforced from day one, not just a service-role bypass).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
