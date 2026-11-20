begin;

create or replace function public.get_story_feed(
  p_search text default null,
  p_category_slug text default null,
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
  category_name text,
  category_slug text,
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
        categories.name as category_name,
        categories.slug as category_slug
      from public.stories as stories
      join public.profiles as profiles on profiles.id = stories.author_id
      left join public.categories as categories on categories.id = stories.category_id
      where stories.status = 'published'
        and stories.is_hidden = false
        and (
          coalesce(p_featured_only, false) = false
          or stories.is_featured = true
        )
        and (
          p_category_slug is null
          or (
            categories.slug = p_category_slug
            and categories.is_active = true
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
      story_metrics.category_name,
      story_metrics.category_slug,
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

revoke all on function public.get_story_feed(text, text, text, integer, integer, boolean, integer)
  from public;
grant execute on function public.get_story_feed(text, text, text, integer, integer, boolean, integer)
  to anon, authenticated;

commit;
