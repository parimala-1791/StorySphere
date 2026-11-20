begin;

insert into public.categories (name, slug, description, sort_order)
values
  ('Romance', 'romance', 'Stories about love, connection, and relationships.', 70),
  ('Fantasy', 'fantasy', 'Imagined worlds, magic, and the extraordinary.', 80),
  ('Mystery', 'mystery', 'Stories built around secrets, clues, and discovery.', 90),
  ('Thriller', 'thriller', 'Suspenseful stories driven by danger and urgency.', 100),
  ('Horror', 'horror', 'Stories that explore fear, the uncanny, and the unknown.', 110),
  ('Science Fiction', 'science-fiction', 'Speculative stories shaped by science and technology.', 120),
  ('Adventure', 'adventure', 'Stories of quests, exploration, and daring journeys.', 130),
  ('Drama', 'drama', 'Character-focused stories about conflict and change.', 140),
  ('Comedy', 'comedy', 'Stories that find humor in people and everyday life.', 150),
  ('Short Stories', 'short-stories', 'Complete works told in a concise form.', 160),
  ('Historical Fiction', 'historical-fiction', 'Imagined stories set in real historical periods.', 170),
  ('Mythology', 'mythology', 'Stories inspired by myths, legends, and folklore.', 180),
  ('Personal Stories', 'personal-stories', 'First-person stories grounded in lived experience.', 190),
  ('Life Lessons', 'life-lessons', 'Stories about insight, growth, and hard-won wisdom.', 200),
  ('Inspirational', 'inspirational', 'Stories that encourage hope, courage, and possibility.', 210),
  ('Young Adult', 'young-adult', 'Stories centered on the experiences of young adults.', 220),
  ('Fan Fiction', 'fan-fiction', 'Transformative stories inspired by existing fictional worlds.', 230),
  ('Non-Fiction', 'non-fiction', 'True stories, ideas, and accounts of the real world.', 240),
  ('Self-Discovery', 'self-discovery', 'Stories about identity, reflection, and becoming.', 250),
  ('Poetry', 'poetry', 'Language shaped into verse.', 30)
on conflict do nothing;

create table public.story_categories (
  story_id uuid not null references public.stories (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, category_id)
);

create index story_categories_category_story_idx
  on public.story_categories (category_id, story_id);

insert into public.story_categories (story_id, category_id)
select stories.id, stories.category_id
from public.stories
where stories.category_id is not null
on conflict (story_id, category_id) do nothing;

alter table public.story_categories enable row level security;
revoke all on public.story_categories from public, anon, authenticated;
grant select on public.story_categories to anon, authenticated;
grant insert, delete on public.story_categories to authenticated;

create policy "categories assigned to readable stories are visible"
  on public.categories for select to anon, authenticated
  using (
    exists (
      select 1
      from public.story_categories as story_categories
      join public.stories as stories
        on stories.id = story_categories.story_id
      where story_categories.category_id = categories.id
        and (
          (stories.status = 'published' and stories.is_hidden = false)
          or stories.author_id = (select auth.uid())
          or (select public.is_admin())
        )
    )
  );

create policy "visible story categories are readable"
  on public.story_categories for select to anon, authenticated
  using (
    exists (
      select 1
      from public.stories as stories
      where stories.id = story_categories.story_id
        and (
          (stories.status = 'published' and stories.is_hidden = false)
          or stories.author_id = (select auth.uid())
          or (select public.is_admin())
        )
    )
  );

create policy "authors assign active categories to their stories"
  on public.story_categories for insert to authenticated
  with check (
    (
      exists (
        select 1
        from public.stories as stories
        where stories.id = story_categories.story_id
          and stories.author_id = (select auth.uid())
      )
      and exists (
        select 1
        from public.categories as categories
        where categories.id = story_categories.category_id
          and categories.is_active
      )
    )
    or (select public.is_admin())
  );

create policy "authors remove categories from their stories"
  on public.story_categories for delete to authenticated
  using (
    exists (
      select 1
      from public.stories as stories
      where stories.id = story_categories.story_id
        and stories.author_id = (select auth.uid())
    )
    or (select public.is_admin())
  );

create function public.sync_story_categories_from_legacy()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if pg_catalog.current_setting('story_sphere.syncing_story_categories', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.category_id is not null then
      insert into public.story_categories (story_id, category_id)
      values (new.id, new.category_id)
      on conflict (story_id, category_id) do nothing;
    end if;
  elsif new.category_id is distinct from old.category_id then
    delete from public.story_categories
    where story_id = new.id;

    if new.category_id is not null then
      insert into public.story_categories (story_id, category_id)
      values (new.id, new.category_id);
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.sync_story_categories_from_legacy()
  from public, anon;
grant execute on function public.sync_story_categories_from_legacy()
  to authenticated, service_role;

create trigger stories_sync_legacy_category
  after insert or update of category_id on public.stories
  for each row execute function public.sync_story_categories_from_legacy();

create function public.set_story_categories(
  p_story_id uuid,
  p_category_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  selected_category_ids uuid[];
begin
  perform pg_catalog.set_config(
    'story_sphere.syncing_story_categories',
    'on',
    true
  );

  select coalesce(
    array_agg(requested.category_id order by requested.first_ordinality),
    array[]::uuid[]
  )
  into selected_category_ids
  from (
    select requested.category_id, min(requested.ordinality) as first_ordinality
    from unnest(coalesce(p_category_ids, array[]::uuid[]))
      with ordinality as requested(category_id, ordinality)
    where requested.category_id is not null
    group by requested.category_id
  ) as requested;

  update public.stories
  set category_id = selected_category_ids[1]
  where id = p_story_id;

  if not found then
    raise exception 'Story not found or not editable'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from unnest(selected_category_ids) as requested(category_id)
    where not exists (
      select 1
      from public.categories as categories
      where categories.id = requested.category_id
        and categories.is_active
    )
    and not exists (
      select 1
      from public.story_categories as existing
      where existing.story_id = p_story_id
        and existing.category_id = requested.category_id
    )
  ) then
    raise exception 'Only active categories can be newly assigned'
      using errcode = '22023';
  end if;

  delete from public.story_categories as existing
  where existing.story_id = p_story_id
    and not (existing.category_id = any(selected_category_ids));

  insert into public.story_categories (story_id, category_id)
  select p_story_id, requested.category_id
  from unnest(selected_category_ids) as requested(category_id)
  join public.categories as categories
    on categories.id = requested.category_id
   and categories.is_active
  where not exists (
    select 1
    from public.story_categories as existing
    where existing.story_id = p_story_id
      and existing.category_id = requested.category_id
  );
end;
$function$;

revoke all on function public.set_story_categories(uuid, uuid[])
  from public, anon;
grant execute on function public.set_story_categories(uuid, uuid[])
  to authenticated;

create function public.get_story_feed_v2(
  p_search text default null,
  p_category_slugs text[] default null,
  p_sort text default 'newest',
  p_limit integer default 12,
  p_offset integer default 0,
  p_featured_only boolean default false,
  p_recent_days integer default null
)
returns table (
  story_id uuid,
  story_slug text,
  story_title text,
  story_excerpt text,
  story_cover_path text,
  story_published_at timestamptz,
  author_username text,
  author_full_name text,
  author_avatar_path text,
  category_names text[],
  category_slugs text[],
  likes_count bigint,
  comments_count bigint,
  readers_count bigint,
  popularity_score bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  search_term text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if p_sort is null or p_sort not in ('newest', 'popular') then
    raise exception 'Unsupported story sort order'
      using errcode = '22023';
  end if;

  if length(search_term) > 120 then
    raise exception 'Search terms must be 120 characters or fewer'
      using errcode = '22023';
  end if;

  if p_recent_days is not null and (p_recent_days < 1 or p_recent_days > 365) then
    raise exception 'Recent day range must be between 1 and 365'
      using errcode = '22023';
  end if;

  if p_offset is not null and (p_offset < 0 or p_offset > 10000) then
    raise exception 'Story feed offset must be between 0 and 10000'
      using errcode = '22023';
  end if;

  return query
    with candidates as (
      select
        stories.id,
        stories.slug,
        stories.title,
        stories.excerpt,
        stories.cover_path,
        stories.published_at,
        stories.search_document,
        profiles.username,
        profiles.full_name,
        profiles.avatar_path,
        coalesce(category_values.category_names, array[]::text[]) as category_names,
        coalesce(category_values.category_slugs, array[]::text[]) as category_slugs
      from public.stories as stories
      join public.profiles as profiles on profiles.id = stories.author_id
      left join lateral (
        select
          array_agg(categories.name order by categories.sort_order, categories.name)
            as category_names,
          array_agg(categories.slug order by categories.sort_order, categories.name)
            as category_slugs
        from public.story_categories as story_categories
        join public.categories as categories
          on categories.id = story_categories.category_id
        where story_categories.story_id = stories.id
      ) as category_values on true
      where stories.status = 'published'
        and stories.is_hidden = false
        and (
          coalesce(p_featured_only, false) = false
          or stories.is_featured = true
        )
        and (
          coalesce(cardinality(p_category_slugs), 0) = 0
          or exists (
            select 1
            from public.story_categories as story_categories
            join public.categories as categories
              on categories.id = story_categories.category_id
            where story_categories.story_id = stories.id
              and categories.is_active
              and categories.slug = any(p_category_slugs)
          )
        )
        and (
          p_recent_days is null
          or stories.published_at >= now() - (p_recent_days * interval '1 day')
        )
        and (
          search_term is null
          or stories.search_document @@ websearch_to_tsquery('english'::regconfig, search_term)
          or position(lower(search_term) in lower(profiles.full_name)) > 0
          or position(lower(search_term) in lower(profiles.username)) > 0
          or exists (
            select 1
            from public.story_categories as story_categories
            join public.categories as categories
              on categories.id = story_categories.category_id
            where story_categories.story_id = stories.id
              and categories.is_active
              and (
                position(lower(search_term) in lower(categories.name)) > 0
                or position(lower(search_term) in lower(categories.slug)) > 0
              )
          )
        )
    ),
    story_metrics as (
      select
        candidates.*,
        likes.total_count as likes_count,
        comments.total_count as comments_count,
        reading.readers_count,
        likes.recent_count + comments.recent_count + reading.recent_readers
          as popularity_score
      from candidates
      left join lateral (
        select
          count(*)::bigint as total_count,
          count(*) filter (
            where likes.created_at >= now() - interval '30 days'
          )::bigint as recent_count
        from public.likes as likes
        where likes.story_id = candidates.id
      ) as likes on true
      left join lateral (
        select
          count(*)::bigint as total_count,
          count(*) filter (
            where comments.created_at >= now() - interval '30 days'
          )::bigint as recent_count
        from public.comments as comments
        where comments.story_id = candidates.id
          and comments.is_hidden = false
      ) as comments on true
      left join lateral (
        select
          count(*)::bigint as readers_count,
          count(*) filter (
            where history.last_read_at >= now() - interval '30 days'
          )::bigint as recent_readers
        from public.reading_history as history
        where history.story_id = candidates.id
      ) as reading on true
    )
    select
      story_metrics.id,
      story_metrics.slug,
      story_metrics.title,
      story_metrics.excerpt,
      story_metrics.cover_path,
      story_metrics.published_at,
      story_metrics.username,
      story_metrics.full_name,
      story_metrics.avatar_path,
      story_metrics.category_names,
      story_metrics.category_slugs,
      story_metrics.likes_count,
      story_metrics.comments_count,
      story_metrics.readers_count,
      story_metrics.popularity_score
    from story_metrics
    order by
      case when p_sort = 'popular' then story_metrics.popularity_score end desc nulls last,
      case when p_sort = 'newest' then story_metrics.published_at end desc nulls last,
      story_metrics.published_at desc,
      story_metrics.id
    limit greatest(1, least(coalesce(p_limit, 12), 24))
    offset coalesce(p_offset, 0);
end;
$function$;

revoke all on function public.get_story_feed_v2(text, text[], text, integer, integer, boolean, integer)
  from public;
grant execute on function public.get_story_feed_v2(text, text[], text, integer, integer, boolean, integer)
  to anon, authenticated;

create function public.get_profile_story_feed_v2(
  p_username text,
  p_limit integer default 12,
  p_offset integer default 0
)
returns table (
  story_id uuid,
  story_slug text,
  story_title text,
  story_excerpt text,
  story_cover_path text,
  story_published_at timestamptz,
  author_username text,
  author_full_name text,
  author_avatar_path text,
  category_names text[],
  category_slugs text[],
  likes_count bigint,
  comments_count bigint,
  readers_count bigint,
  popularity_score bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  normalized_username text := lower(btrim(coalesce(p_username, '')));
begin
  if normalized_username !~ '^[a-z0-9_]{3,30}$' then
    raise exception 'Writer usernames must be 3 to 30 lowercase letters, numbers, or underscores'
      using errcode = '22023';
  end if;

  if p_offset is not null and (p_offset < 0 or p_offset > 10000) then
    raise exception 'Profile story offset must be between 0 and 10000'
      using errcode = '22023';
  end if;

  return query
    with candidates as (
      select
        stories.id,
        stories.slug,
        stories.title,
        stories.excerpt,
        stories.cover_path,
        stories.published_at,
        profiles.username,
        profiles.full_name,
        profiles.avatar_path,
        coalesce(category_values.category_names, array[]::text[]) as category_names,
        coalesce(category_values.category_slugs, array[]::text[]) as category_slugs
      from public.stories as stories
      join public.profiles as profiles on profiles.id = stories.author_id
      left join lateral (
        select
          array_agg(categories.name order by categories.sort_order, categories.name)
            as category_names,
          array_agg(categories.slug order by categories.sort_order, categories.name)
            as category_slugs
        from public.story_categories as story_categories
        join public.categories as categories
          on categories.id = story_categories.category_id
        where story_categories.story_id = stories.id
      ) as category_values on true
      where profiles.username = normalized_username
        and stories.status = 'published'
        and stories.is_hidden = false
    ),
    story_metrics as (
      select
        candidates.*,
        likes.total_count as likes_count,
        comments.total_count as comments_count,
        reading.readers_count,
        likes.recent_count + comments.recent_count + reading.recent_readers
          as popularity_score
      from candidates
      left join lateral (
        select
          count(*)::bigint as total_count,
          count(*) filter (
            where likes.created_at >= now() - interval '30 days'
          )::bigint as recent_count
        from public.likes as likes
        where likes.story_id = candidates.id
      ) as likes on true
      left join lateral (
        select
          count(*)::bigint as total_count,
          count(*) filter (
            where comments.created_at >= now() - interval '30 days'
          )::bigint as recent_count
        from public.comments as comments
        where comments.story_id = candidates.id
          and comments.is_hidden = false
      ) as comments on true
      left join lateral (
        select
          count(*)::bigint as readers_count,
          count(*) filter (
            where history.last_read_at >= now() - interval '30 days'
          )::bigint as recent_readers
        from public.reading_history as history
        where history.story_id = candidates.id
      ) as reading on true
    )
    select
      story_metrics.id,
      story_metrics.slug,
      story_metrics.title,
      story_metrics.excerpt,
      story_metrics.cover_path,
      story_metrics.published_at,
      story_metrics.username,
      story_metrics.full_name,
      story_metrics.avatar_path,
      story_metrics.category_names,
      story_metrics.category_slugs,
      story_metrics.likes_count,
      story_metrics.comments_count,
      story_metrics.readers_count,
      story_metrics.popularity_score
    from story_metrics
    order by story_metrics.published_at desc, story_metrics.id
    limit greatest(1, least(coalesce(p_limit, 12), 24))
    offset coalesce(p_offset, 0);
end;
$function$;

revoke all on function public.get_profile_story_feed_v2(text, integer, integer)
  from public;
grant execute on function public.get_profile_story_feed_v2(text, integer, integer)
  to anon, authenticated;

commit;
