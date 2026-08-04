# Expense Tracker — Product & Technical Spec

Single-user today, multi-user ready by design. Mobile-first web app (PWA) that installs to a phone home screen.

---

## 1. Core principles

1. **The ledger is the truth.** An account's balance is never a number you overwrite — it's `opening_balance + sum(transactions)`. "Set current balance" creates an *adjustment* transaction for the difference. This keeps history honest and makes reports correct forever.
2. **Money is stored as integers** in minor units (para/cents). Never floats. `1.234,56 RSD` → `123456`.
3. **`user_id` on every row from day one**, with Postgres Row Level Security. Multi-user later becomes a login screen, not a rewrite.
4. **Adding an expense takes under 5 seconds.** Everything else is secondary. If a feature makes the add-flow slower, it goes behind a "more" toggle.
5. **Soft delete everywhere.** `deleted_at` instead of `DELETE`. Undo is cheap.

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | One codebase for UI + API routes; deploys free on Vercel |
| Styling | Tailwind CSS + shadcn/ui | Fast, consistent, mobile-first |
| Database | Supabase (Postgres) | Free tier, real SQL, RLS built in |
| Auth | Supabase Auth | Off from day one for you; flipping it on gives multi-user |
| State/data | TanStack Query | Caching, optimistic updates for instant-feeling adds |
| Charts | Recharts | Simple, good enough |
| Dates | date-fns | Lightweight |
| Hosting | Vercel | Free, push-to-deploy |
| Mobile | PWA (manifest + service worker) | Installs to home screen, no app store |

**Locale defaults:** `sr-RS`, currency `RSD`, week starts Monday, date format `dd.MM.yyyy`.

---

## 3. Data model

```sql
-- profiles: mirrors auth.users, one row per person
profiles(
  id uuid pk references auth.users,
  display_name text,
  base_currency text default 'RSD',
  created_at timestamptz
)

-- accounts: cash, debit cards, credit cards, savings
accounts(
  id uuid pk,
  user_id uuid not null,
  name text not null,              -- "Intesa Visa", "Wallet", "Revolut"
  type text not null,              -- 'cash' | 'debit' | 'credit' | 'savings'
  currency text not null default 'RSD',
  opening_balance bigint not null default 0,   -- minor units
  color text,
  icon text,
  -- credit card only:
  credit_limit bigint,
  statement_day int,               -- 1-28, day the statement closes
  due_day int,                     -- 1-28, day payment is due
  include_in_net_worth bool default true,
  sort_order int default 0,
  archived_at timestamptz,
  created_at timestamptz
)

-- categories: two-level (parent + child), typed
categories(
  id uuid pk,
  user_id uuid not null,
  name text not null,
  kind text not null,              -- 'expense' | 'income'
  parent_id uuid references categories,
  color text,
  icon text,
  sort_order int default 0,
  archived_at timestamptz
)

-- transactions: the single ledger table
transactions(
  id uuid pk,
  user_id uuid not null,
  type text not null,              -- 'expense' | 'income' | 'transfer' | 'adjustment'
  account_id uuid not null references accounts,      -- money leaves/enters here
  to_account_id uuid references accounts,            -- transfers only
  category_id uuid references categories,            -- null for transfer/adjustment
  amount bigint not null,          -- always positive; sign derived from type
  currency text not null,
  fx_rate numeric,                 -- if currency != account currency
  occurred_on date not null,
  note text,
  merchant text,
  tags text[],
  receipt_url text,
  recurring_id uuid references recurring_rules,
  deleted_at timestamptz,
  created_at timestamptz
)

-- recurring_rules: rent, subscriptions, salary
recurring_rules(
  id uuid pk,
  user_id uuid not null,
  template jsonb not null,         -- the transaction fields to clone
  frequency text not null,         -- 'daily'|'weekly'|'monthly'|'yearly'
  interval int default 1,
  day_of_month int,
  next_run_on date not null,
  end_on date,
  auto_post bool default false,    -- true = create automatically, false = prompt
  paused_at timestamptz
)

-- budgets: per category per month
budgets(
  id uuid pk,
  user_id uuid not null,
  category_id uuid not null,
  period_month date not null,      -- first day of month
  amount bigint not null,
  unique(user_id, category_id, period_month)
)
```

**Balance rules**
- Debit/cash/savings: `balance = opening_balance + income + transfers_in − expenses − transfers_out ± adjustments`
- Credit card: same formula, but balance is normally **negative** = money owed. Display it as "Owed: 24.500 RSD" and show `utilization = owed / credit_limit`.
- Paying a credit card = a **transfer** from a debit/cash account to the credit account. It is not an expense — the expense already happened when you swiped. This is the single most common thing expense apps get wrong.
- Net worth = sum of all non-archived accounts with `include_in_net_worth`.

**Indexes:** `(user_id, occurred_on desc)`, `(user_id, account_id)`, `(user_id, category_id)` on transactions.

**RLS policy pattern (every table):**
```sql
create policy "own rows" on <table>
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

---

## 4. Screens

| Screen | Contents |
|---|---|
| **Home** | Net worth, account cards in a horizontal strip, this month's income/expense/net, last 10 transactions, big floating **+** button |
| **Add transaction** | Sheet from bottom: numpad-first amount, then type toggle (Expense/Income/Transfer), account, category, date (defaults today), optional note/tags. Save + "Save and add another" |
| **Transactions** | Infinite list grouped by day, running daily totals, filter bar (account, category, type, date range, text search) |
| **Accounts** | List with balances, add/edit/archive. Credit cards show owed, limit, utilization bar, statement + due dates. "Set current balance" action → creates adjustment |
| **Categories** | Two-level list, drag to reorder, add/edit/archive, colors + emoji icons |
| **Reports** | Month selector; donut of spend by category, income vs expense bars over 12 months, category drill-down to transactions, budget progress bars |
| **Settings** | Base currency, theme, export CSV/JSON, import CSV, (later) account & sharing |

**Navigation:** bottom tab bar — Home · Transactions · **+** · Reports · Settings.

---

## 5. Build phases

### Phase 0 — Foundation
Next.js + TS + Tailwind + shadcn scaffold, Supabase project, migrations for all tables above, RLS on, seed script with a default category set (Groceries, Rent, Utilities, Transport, Eating out, Health, Fun, Clothes, Subscriptions, Other / Salary, Freelance, Gift, Refund, Other). Money helpers (`toMinor`, `fromMinor`, `formatRSD`) with unit tests. Deploy to Vercel — verify a blank page ships before writing features.

### Phase 1 — Core loop *(the app is usable at the end of this phase)*
Accounts CRUD → Categories CRUD → Add transaction (expense + income) → Transaction list with filters → Home dashboard with balances → Set current balance via adjustment.

### Phase 2 — Cards & movement
Credit card type with limit/statement/due + utilization display, transfers between accounts, credit card payment flow, cash account handling, account archiving.

### Phase 3 — Automation & insight
Recurring rules with a due-today prompt on Home, budgets per category, reports screen, CSV import/export, receipt photo upload to Supabase Storage.

### Phase 4 — Multi-user
Turn on Supabase Auth (email + Google), login/signup screens, migrate existing rows to your `user_id`, then **shared spaces**: a `spaces` table + `space_members` join table, accounts and transactions optionally owned by a space instead of a user, with roles (owner/editor/viewer). Households can then share a budget while keeping personal accounts private.

### Phase 5 — Polish
PWA manifest + offline read cache + install prompt, optimistic updates everywhere, keyboard/numpad ergonomics, dark mode, empty states, undo toasts, monthly summary notification.

---

## 6. Feature ideas beyond your list

**High value, low effort — do these**
- **Transfers between accounts.** Without them, moving cash from bank to wallet looks like an expense and inflates your spending.
- **Recurring transactions** for rent, subscriptions, salary. Most of a month's entries are the same every month.
- **Quick-add templates** — "Coffee 250 RSD, Eating out, Wallet" as a one-tap button.
- **Duplicate/repeat last transaction.**
- **Undo toast** after every save and delete.
- **CSV export** — your data, your escape hatch. Build it early, it makes debugging easier too.

**Worth doing once the core works**
- Budgets per category with a monthly progress bar and "you can spend X/day for the rest of the month".
- Multi-currency (RSD + EUR is realistic in Serbia) — store `fx_rate` per transaction so historic reports don't shift when rates move.
- Tags on top of categories, for cross-cutting things like a trip or a renovation.
- Receipt photos.
- Search across notes and merchants.
- Month-over-month comparison: "Groceries up 18% vs last month".

**Later / optional**
- Debts & IOUs — money lent to friends, tracked as a pseudo-account.
- Split expenses with people (needs multi-user first).
- Savings goals with progress.
- Credit card statement view: what's in the current cycle vs already billed, and a due-date reminder.
- Bank SMS/notification parsing to prefill transactions (Serbian banks send SMS on card use — a regex per bank goes a long way).
- Widget-style "spent today" on the PWA home screen.

**Deliberately not doing**
Bank API sync (expensive, painful licensing), investment portfolio tracking, double-entry accounting UI. Keep it a spending tracker.

---

## 7. Acceptance checks per phase

- **P1:** Add 20 mixed transactions across 3 accounts; every account balance matches a hand calculation. Set a balance manually; ledger sum still matches the displayed balance.
- **P2:** Swipe a credit card for 5.000, pay it from debit; net worth changes by −5.000 total, not −10.000.
- **P3:** A recurring rent rule fires exactly once on its date, even if the app is opened five times that day.
- **P4:** Log in as user B; zero rows from user A are visible in any query, verified against the database directly, not just the UI.
