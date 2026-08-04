-- recurring_rules: rent, subscriptions, salary. transactions.recurring_id
-- references this table, so it must exist first.
create table recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  template jsonb not null,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  interval int not null default 1 check (interval > 0),
  day_of_month int check (day_of_month between 1 and 31),
  next_run_on date not null,
  end_on date,
  auto_post boolean not null default false,
  paused_at timestamptz,
  created_at timestamptz not null default now()
);

create index recurring_rules_user_id_idx on recurring_rules (user_id);
create index recurring_rules_next_run_on_idx on recurring_rules (user_id, next_run_on);

alter table recurring_rules enable row level security;

create policy "own rows" on recurring_rules
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
