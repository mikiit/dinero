-- categories are two-level (parent + child) and typed expense/income. A
-- FK on parent_id only proves the referenced row exists - not that it
-- belongs to the same user, has no parent of its own (which would make a
-- third level), or shares the same kind as its child. Same class of gap
-- assert_account_ownership() closed for transactions/budgets, here applied
-- to categories' own self-reference.
create or replace function public.assert_category_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_id_of_parent uuid;
  parent_kind text;
  has_own_children boolean;
begin
  if NEW.parent_id is null then
    return NEW;
  end if;

  if NEW.parent_id = NEW.id then
    raise exception 'a category cannot be its own parent (%)', NEW.id
      using errcode = '23514';
  end if;

  select parent_id, kind into parent_id_of_parent, parent_kind
  from categories
  where id = NEW.parent_id and user_id = NEW.user_id;

  if parent_kind is null then
    raise exception 'parent category % does not belong to user %', NEW.parent_id, NEW.user_id
      using errcode = '42501';
  end if;

  if parent_id_of_parent is not null then
    raise exception 'categories are two levels deep - % already has a parent', NEW.parent_id
      using errcode = '23514';
  end if;

  if parent_kind <> NEW.kind then
    raise exception 'category kind % does not match parent kind %', NEW.kind, parent_kind
      using errcode = '23514';
  end if;

  -- Catches the same depth violation from the other direction: NEW is
  -- currently a parent to other rows, so making it a child too would
  -- silently create a third level (NEW.parent_id -> NEW -> NEW's children).
  select exists(
    select 1 from categories where parent_id = NEW.id and user_id = NEW.user_id
  ) into has_own_children;

  if has_own_children then
    raise exception 'category % already has children and cannot become a child itself', NEW.id
      using errcode = '23514';
  end if;

  return NEW;
end;
$$;

create trigger assert_category_hierarchy
  before insert or update on categories
  for each row execute function public.assert_category_hierarchy();
