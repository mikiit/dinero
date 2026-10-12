-- Recurring rules must post each occurrence exactly once, even when the app
-- is opened several times at the same moment (SPEC.md §7, Phase 3 check:
-- "fires exactly once on its date, even if the app is opened five times
-- that day"). A check-then-insert in application code can't guarantee that -
-- two concurrent requests both see "not posted yet" - so the guarantee lives
-- in the database: one transaction per (rule, occurrence date), full stop.
--
-- Deliberately NOT filtered by deleted_at: if the user deletes an
-- auto-posted transaction, that occurrence must stay "handled" rather than
-- being re-created the next time the app opens.
create unique index transactions_recurring_occurrence_key
  on transactions (recurring_id, occurred_on)
  where recurring_id is not null;

-- Soft delete (CLAUDE.md rule 4). Hard-deleting a rule is impossible anyway
-- once it has posted anything: transactions.recurring_id references it.
alter table recurring_rules add column deleted_at timestamptz;
