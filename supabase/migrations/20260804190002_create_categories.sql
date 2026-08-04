-- categories: two-level (parent + child), typed expense/income.
create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  kind text not null check (kind in ('expense', 'income')),
  parent_id uuid references categories (id),
  color text,
  icon text,
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index categories_user_id_idx on categories (user_id);
create index categories_parent_id_idx on categories (parent_id);

alter table categories enable row level security;

create policy "own rows" on categories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
