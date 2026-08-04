-- budgets: per category per month. period_month is always the first of the
-- month so month-over-month joins and reports don't silently misalign.
create table budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  category_id uuid not null references categories (id),
  period_month date not null check (extract(day from period_month) = 1),
  amount bigint not null check (amount >= 0),
  created_at timestamptz not null default now(),

  unique (user_id, category_id, period_month)
);

create index budgets_user_period_idx on budgets (user_id, period_month);

alter table budgets enable row level security;

create policy "own rows" on budgets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
