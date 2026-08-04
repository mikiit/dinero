-- accounts: cash, debit cards, credit cards, savings.
-- Balances are never stored here — opening_balance is the only stored
-- number; the rest is derived from transactions (CLAUDE.md rule 2).
create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  type text not null check (type in ('cash', 'debit', 'credit', 'savings')),
  currency text not null default 'RSD',
  opening_balance bigint not null default 0,
  color text,
  icon text,
  -- credit card only:
  credit_limit bigint check (credit_limit is null or credit_limit >= 0),
  statement_day int check (statement_day between 1 and 28),
  due_day int check (due_day between 1 and 28),
  include_in_net_worth boolean not null default true,
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index accounts_user_id_idx on accounts (user_id);

alter table accounts enable row level security;

create policy "own rows" on accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
