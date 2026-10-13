-- Duplicate default categories: two serverless instances could both see "no
-- categories yet" on a first load and both insert the full default set, and
-- nothing in the database stopped it. Fix it where it can actually be
-- enforced:
--   1. merge the duplicates that already exist, repointing every reference;
--   2. add partial unique indexes so they cannot come back.
--
-- Categories have no deleted_at; "removed" means archived_at is set. Archived
-- rows are left alone: they may legitimately share a name with an active one
-- (a user archives "Food", later creates a new "Food").

-- ---------------------------------------------------------------------------
-- 1. Merge existing duplicates (oldest active row wins)
-- ---------------------------------------------------------------------------
-- Two levels, parents first: merging duplicate parents moves their children
-- under the surviving parent, which can in turn make those children
-- duplicates of each other - so children are merged in the second pass.
do $$
declare
  lvl int;
begin
  for lvl in 1..2 loop
    create temp table category_merge on commit drop as
    select id as dup_id, keep_id
    from (
      select
        id,
        first_value(id) over (
          partition by
            space_id,
            case when space_id is null then user_id end,
            kind,
            name,
            parent_id
          order by created_at, id
        ) as keep_id
      from categories
      where archived_at is null
        and ((lvl = 1 and parent_id is null) or (lvl = 2 and parent_id is not null))
    ) ranked
    where id <> keep_id;

    -- Children of a duplicate parent move to the surviving parent.
    update categories c
    set parent_id = m.keep_id
    from category_merge m
    where c.parent_id = m.dup_id;

    -- Budgets are unique per (ledger, category, month, currency). If moving
    -- them onto the survivor would collide, keep the survivor's own budget
    -- (else the oldest duplicate's) and drop the rest.
    delete from budgets
    where id in (
      select id
      from (
        select
          b.id,
          row_number() over (
            partition by
              m.keep_id,
              b.period_month,
              b.currency,
              b.space_id,
              case when b.space_id is null then b.user_id end
            order by (b.category_id = m.keep_id) desc, b.created_at, b.id
          ) as rn
        from budgets b
        join (
          select dup_id as old_id, keep_id from category_merge
          union
          select keep_id as old_id, keep_id from category_merge
        ) m on m.old_id = b.category_id
      ) x
      where rn > 1
    );

    update budgets b
    set category_id = m.keep_id
    from category_merge m
    where b.category_id = m.dup_id;

    -- Includes soft-deleted transactions: they must not dangle either.
    update transactions t
    set category_id = m.keep_id
    from category_merge m
    where t.category_id = m.dup_id;

    -- Recurring rules keep the category inside their template jsonb.
    update recurring_rules r
    set template = jsonb_set(r.template, '{categoryId}', to_jsonb(m.keep_id::text))
    from category_merge m
    where r.template ->> 'categoryId' = m.dup_id::text;

    delete from categories c
    using category_merge m
    where c.id = m.dup_id;

    drop table category_merge;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Make it impossible to insert them again
-- ---------------------------------------------------------------------------
-- Two ledgers, as everywhere else: personal rows (space_id null) are unique
-- per user; space rows per space, regardless of which member created them.
-- parent_id is NULL for top-level categories and NULLs never compare equal in
-- a unique index, so it is folded to the all-zero uuid.
create unique index categories_active_personal_unique
  on categories (user_id, kind, name, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where space_id is null and archived_at is null;

create unique index categories_active_space_unique
  on categories (space_id, kind, name, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where space_id is not null and archived_at is null;
