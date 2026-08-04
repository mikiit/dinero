# CLAUDE.md

Expense tracker. Mobile-first PWA. Single user now, multi-user later.
Full product spec lives in `SPEC.md` — read it before starting any task.

## Stack
Next.js (App Router) · TypeScript (strict) · Tailwind + shadcn/ui · Supabase (Postgres + Auth + Storage) · TanStack Query · Recharts · date-fns · Vercel

## Non-negotiable rules

1. **Money is `bigint` in minor units.** No floats, no `number` for amounts anywhere near the database. All conversion goes through `lib/money.ts`. If you're writing `* 100` outside that file, stop.
2. **Balances are derived, never stored.** `opening_balance + sum(transactions)`. "Set balance" writes an `adjustment` transaction. Never `UPDATE accounts SET balance = ...`.
3. **Every table has `user_id` and an RLS policy**, even while auth is off. New table without a policy = broken.
4. **Soft delete.** `deleted_at timestamptz`. Every read filters `deleted_at is null`.
5. **Credit card payments are transfers, not expenses.**
6. **Server Components by default.** `"use client"` only where there's interactivity.
7. **No new dependency** without saying why in the PR/commit message. The list above is the budget.

## Conventions
- Files: `kebab-case.tsx`. Components: `PascalCase`. Hooks: `use-thing.ts`.
- `app/` routes · `components/ui` shadcn · `components/` app components · `lib/` helpers · `supabase/migrations/` SQL.
- All DB access through typed helpers in `lib/db/`, never inline queries in components.
- Types generated from Supabase into `lib/database.types.ts` — regenerate after every migration.
- Dates: store `date` for `occurred_on` (no timezone), `timestamptz` for audit columns.
- Locale: `sr-RS`, RSD default, Monday week start, `dd.MM.yyyy`.

## Migrations
One file per change in `supabase/migrations/`, timestamped, forward-only. Never edit an applied migration. Include the RLS policy in the same file as the `create table`.

## Testing
Vitest. Required coverage: money conversion, balance calculation, recurring-rule date math, credit card utilization. Skip tests for pure presentational components.

## Workflow
- Work one phase at a time (see `SPEC.md` §5). Don't start the next phase until the current one's acceptance check passes.
- Commit per logical unit with a conventional-commit message.
- Run `npm run typecheck && npm run lint && npm test` before declaring anything done.
- When a requirement is ambiguous, ask rather than assume — this is a personal-finance app and silently wrong numbers are the worst failure mode.

## Framework agent notes
@AGENTS.md
