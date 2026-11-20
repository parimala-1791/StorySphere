begin;

create function public.can_read_story_category_assignment(p_category_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $function$
  select exists (
    select 1
    from public.story_categories as story_categories
    join public.stories as stories
      on stories.id = story_categories.story_id
    where story_categories.category_id = p_category_id
      and (
        (stories.status = 'published' and stories.is_hidden = false)
        or stories.author_id = (select auth.uid())
        or (select public.is_admin())
      )
  );
$function$;

comment on function public.can_read_story_category_assignment(uuid)
  is 'RLS helper that returns only whether the caller can read an assignment for this category.';

revoke all on function public.can_read_story_category_assignment(uuid)
  from public, anon, authenticated;
grant execute on function public.can_read_story_category_assignment(uuid)
  to anon, authenticated;

drop policy if exists "categories assigned to readable stories are visible"
  on public.categories;

create policy "categories assigned to readable stories are visible"
  on public.categories for select to anon, authenticated
  using (
    (select public.can_read_story_category_assignment(categories.id))
  );

commit;
