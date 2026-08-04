-- transactions: the single ledger table. The ledger is the truth — account
-- balances are always opening_balance + sum(transactions), never a stored
-- column (CLAUDE.md rule 2). Credit card payments are transfers, not
-- expenses (CLAUDE.md rule 5) — enforced below by requiring to_account_id
-- on transfers and forbidding a category on transfer/adjustment rows.
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null check (type in ('expense', 'income', 'transfer', 'adjustment')),
  account_id uuid not null references accounts (id),
  to_account_id uuid references accounts (id),
  category_id uuid references categories (id),
  amount bigint not null check (amount > 0),
  currency text not null,
  fx_rate numeric,
  occurred_on date not null,
  note text,
  merchant text,
  tags text[],
  receipt_url text,
  recurring_id uuid references recurring_rules (id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),

  constraint transfer_requires_to_account check (
    (type = 'transfer' and to_account_id is not null)
    or (type <> 'transfer')
  ),
  constraint transfer_not_to_self check (
    to_account_id is null or to_account_id <> account_id
  ),
  constraint category_only_for_expense_income check (
    (type in ('expense', 'income')) or category_id is null
  )
);

create index transactions_user_occurred_on_idx on transactions (user_id, occurred_on desc);
create index transactions_user_account_idx on transactions (user_id, account_id);
create index transactions_user_category_idx on transactions (user_id, category_id);

alter table transactions enable row level security;

create policy "own rows" on transactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
