begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres, service_role;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9_]{3,30}$'),
  full_name text not null check (length(btrim(full_name)) between 1 and 80),
  avatar_path text,
  bio text not null default '' check (length(bio) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_avatar_path_owner check (
    avatar_path is null
    or (
      split_part(avatar_path, '/', 1) = id::text
      and array_length(string_to_array(avatar_path, '/'), 1) = 2
      and lower(avatar_path) ~ '\.(avif|jpe?g|png|webp)$'
    )
  )
);

create unique index profiles_username_lower_idx on public.profiles (lower(username));

create table private.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin')),
  created_at timestamptz not null default now()
);
alter table private.user_roles enable row level security;
revoke all on private.user_roles from public, anon, authenticated;
grant select, insert, update, delete on private.user_roles to service_role;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 60),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '' check (length(description) <= 500),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.categories (name, slug, description, sort_order)
values
  ('Fiction', 'fiction', 'Stories born from imagination.', 10),
  ('Memoir', 'memoir', 'Personal histories and lived experience.', 20),
  ('Poetry', 'poetry', 'Language shaped into verse.', 30),
  ('Everyday Life', 'everyday-life', 'Small moments, observations, and reflections.', 40),
  ('Culture', 'culture', 'Stories shaped by place, identity, and tradition.', 50),
  ('Travel', 'travel', 'Journeys near and far.', 60)
on conflict (slug) do nothing;

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 40),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  title text not null check (length(btrim(title)) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  excerpt text not null default '' check (length(excerpt) <= 500),
  content text not null default '',
  cover_path text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  is_featured boolean not null default false,
  is_hidden boolean not null default false,
  search_document tsvector generated always as (
    to_tsvector('english', title || ' ' || excerpt || ' ' || content)
  ) stored,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stories_published_content check (
    status <> 'published' or length(btrim(content)) > 0
  ),
  constraint stories_cover_path_owner check (
    cover_path is null
    or (
      split_part(cover_path, '/', 1) = author_id::text
      and split_part(cover_path, '/', 2) = id::text
      and array_length(string_to_array(cover_path, '/'), 1) = 3
      and lower(cover_path) ~ '\.(avif|jpe?g|png|webp)$'
    )
  )
);

create index stories_public_feed_idx
  on public.stories (published_at desc, id)
  where status = 'published' and is_hidden = false;
create index stories_author_updated_idx on public.stories (author_id, updated_at desc);
create index stories_category_published_idx
  on public.stories (category_id, published_at desc)
  where status = 'published' and is_hidden = false;
create index stories_featured_idx
  on public.stories (published_at desc)
  where is_featured = true and status = 'published' and is_hidden = false;
create index stories_search_document_idx
  on public.stories using gin (search_document);

create table public.story_tags (
  story_id uuid not null references public.stories (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, tag_id)
);
create index story_tags_tag_id_idx on public.story_tags (tag_id, story_id);

create table public.likes (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  story_id uuid not null references public.stories (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, story_id)
);
create index likes_story_id_idx on public.likes (story_id, created_at desc);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  content text not null check (length(btrim(content)) between 1 and 3000),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index comments_story_created_idx on public.comments (story_id, created_at);
create index comments_author_created_idx on public.comments (author_id, created_at desc);

create table public.bookmarks (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  story_id uuid not null references public.stories (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, story_id)
);
create index bookmarks_user_created_idx on public.bookmarks (user_id, created_at desc);

create table public.follows (
  follower_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  followed_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  constraint follows_no_self_follow check (follower_id <> followed_id)
);
create index follows_followed_id_idx on public.follows (followed_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  notification_type text not null check (
    notification_type in ('like', 'comment', 'follow')
  ),
  story_id uuid references public.stories (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx
  on public.notifications (recipient_id, created_at desc)
  where is_read = false;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  story_id uuid references public.stories (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  reason text not null check (
    reason in ('spam', 'harassment', 'hate', 'explicit', 'copyright', 'other')
  ),
  details text not null default '' check (length(details) <= 2000),
  status text not null default 'open' check (
    status in ('open', 'reviewing', 'resolved', 'dismissed')
  ),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint reports_single_target check (
    (story_id is not null and comment_id is null)
    or (story_id is null and comment_id is not null)
  )
);
create index reports_status_created_idx on public.reports (status, created_at);
create index reports_reporter_created_idx on public.reports (reporter_id, created_at desc);
create unique index reports_one_open_story_per_reporter_idx
  on public.reports (reporter_id, story_id)
  where story_id is not null and status in ('open', 'reviewing');
create unique index reports_one_open_comment_per_reporter_idx
  on public.reports (reporter_id, comment_id)
  where comment_id is not null and status in ('open', 'reviewing');

create table public.reading_history (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  story_id uuid not null references public.stories (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  read_count integer not null default 1 check (read_count > 0),
  primary key (user_id, story_id)
);
create index reading_history_user_last_read_idx
  on public.reading_history (user_id, last_read_at desc);
create index reading_history_story_idx on public.reading_history (story_id, last_read_at desc);

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from private.user_roles as roles
    where roles.user_id = (select auth.uid())
      and roles.role = 'admin'
  );
$function$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.is_admin();
$function$;

revoke all on function private.is_admin() from public, anon, authenticated;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  username_base text;
  safe_username text;
  safe_full_name text;
begin
  username_base := lower(
    regexp_replace(
      coalesce(new.raw_user_meta_data ->> 'username', ''),
      '[^a-z0-9_]+',
      '_',
      'g'
    )
  );
  username_base := trim(both '_' from username_base);
  if username_base ~ '^[a-z0-9_]{3,30}$' then
    safe_username := username_base;
  else
    safe_username := 'storyteller_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  safe_full_name := left(
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      'Storyteller'
    ),
    80
  );

  insert into public.profiles (id, username, full_name)
  values (new.id, safe_username, safe_full_name)
  on conflict (id) do nothing;

  return new;
end;
$function$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

create or replace function public.prepare_story()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := now();

  if tg_op = 'INSERT' then
    if new.status = 'published' then
      new.published_at := now();
    else
      new.published_at := null;
    end if;
  elsif new.status = 'published' and old.status <> 'published' then
    new.published_at := now();
  elsif new.status <> 'published' then
    new.published_at := null;
  else
    new.published_at := old.published_at;
  end if;

  return new;
end;
$function$;

create or replace function public.guard_story_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not private.is_admin()
    and (
      (tg_op = 'INSERT' and (new.is_featured or new.is_hidden))
      or (
        tg_op = 'UPDATE'
        and (
          new.is_featured is distinct from old.is_featured
          or new.is_hidden is distinct from old.is_hidden
        )
      )
    )
  then
    raise exception 'Only an administrator can change story moderation fields'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

create or replace function public.guard_comment_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not private.is_admin()
    and tg_op = 'UPDATE'
    and new.is_hidden is distinct from old.is_hidden
  then
    raise exception 'Only an administrator can change comment moderation fields'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.prepare_story() from public, anon, authenticated;
revoke all on function public.guard_story_admin_fields() from public, anon, authenticated;
revoke all on function public.guard_comment_admin_fields() from public, anon, authenticated;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();
create trigger tags_set_updated_at
  before update on public.tags
  for each row execute function public.set_updated_at();
create trigger stories_prepare
  before insert or update on public.stories
  for each row execute function public.prepare_story();
create trigger stories_guard_admin_fields
  before insert or update on public.stories
  for each row execute function public.guard_story_admin_fields();
create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();
create trigger comments_guard_admin_fields
  before insert or update on public.comments
  for each row execute function public.guard_comment_admin_fields();

create or replace function public.create_interaction_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_story_id uuid;
  target_comment_id uuid;
  target_recipient_id uuid;
  target_actor_id uuid;
  target_type text;
begin
  if tg_table_name = 'follows' then
    target_recipient_id := new.followed_id;
    target_actor_id := new.follower_id;
    target_type := 'follow';
  elsif tg_table_name = 'likes' then
    target_story_id := new.story_id;
    target_actor_id := new.user_id;
    target_type := 'like';
  else
    target_story_id := new.story_id;
    target_comment_id := new.id;
    target_actor_id := new.author_id;
    target_type := 'comment';
  end if;

  if target_recipient_id is null then
    select stories.author_id
      into target_recipient_id
      from public.stories as stories
      where stories.id = target_story_id;
  end if;

  if target_recipient_id is not null and target_recipient_id <> target_actor_id then
    insert into public.notifications (
      recipient_id,
      actor_id,
      notification_type,
      story_id,
      comment_id
    )
    values (
      target_recipient_id,
      target_actor_id,
      target_type,
      target_story_id,
      target_comment_id
    );
  end if;

  return new;
end;
$function$;

revoke all on function public.create_interaction_notification() from public, anon, authenticated;
create trigger likes_create_notification
  after insert on public.likes
  for each row execute function public.create_interaction_notification();
create trigger comments_create_notification
  after insert on public.comments
  for each row execute function public.create_interaction_notification();
create trigger follows_create_notification
  after insert on public.follows
  for each row execute function public.create_interaction_notification();

create or replace function public.record_story_read(p_story_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Sign in to record reading history'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.stories as stories
      where stories.id = p_story_id
        and stories.status = 'published'
        and stories.is_hidden = false
  ) then
    raise exception 'Story is not available'
      using errcode = 'P0002';
  end if;

  insert into public.reading_history as history (user_id, story_id, last_read_at, read_count)
  values (current_user_id, p_story_id, now(), 1)
  on conflict (user_id, story_id)
  do update set
    last_read_at = excluded.last_read_at,
    read_count = history.read_count + 1;
end;
$function$;

create or replace function public.set_story_moderation(
  p_story_id uuid,
  p_is_hidden boolean,
  p_is_featured boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not private.is_admin() then
    raise exception 'Administrator access is required'
      using errcode = '42501';
  end if;

  update public.stories
    set is_hidden = p_is_hidden,
        is_featured = p_is_featured
    where id = p_story_id;

  if not found then
    raise exception 'Story not found'
      using errcode = 'P0002';
  end if;
end;
$function$;

create or replace function public.set_comment_moderation(
  p_comment_id uuid,
  p_is_hidden boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not private.is_admin() then
    raise exception 'Administrator access is required'
      using errcode = '42501';
  end if;

  update public.comments
    set is_hidden = p_is_hidden
    where id = p_comment_id;

  if not found then
    raise exception 'Comment not found'
      using errcode = 'P0002';
  end if;
end;
$function$;

create or replace function public.review_report(
  p_report_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not private.is_admin() then
    raise exception 'Administrator access is required'
      using errcode = '42501';
  end if;

  if p_status is null or p_status not in ('reviewing', 'resolved', 'dismissed') then
    raise exception 'Invalid report status'
      using errcode = '22023';
  end if;

  update public.reports
    set status = p_status,
        reviewed_by = (select auth.uid()),
        reviewed_at = now()
    where id = p_report_id;

  if not found then
    raise exception 'Report not found'
      using errcode = 'P0002';
  end if;
end;
$function$;

revoke all on function public.record_story_read(uuid) from public, anon;
revoke all on function public.set_story_moderation(uuid, boolean, boolean) from public, anon;
revoke all on function public.set_comment_moderation(uuid, boolean) from public, anon;
revoke all on function public.review_report(uuid, text) from public, anon;
grant execute on function public.record_story_read(uuid) to authenticated;
grant execute on function public.set_story_moderation(uuid, boolean, boolean) to authenticated;
grant execute on function public.set_comment_moderation(uuid, boolean) to authenticated;
grant execute on function public.review_report(uuid, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.tags enable row level security;
alter table public.stories enable row level security;
alter table public.story_tags enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.bookmarks enable row level security;
alter table public.follows enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.reading_history enable row level security;

create policy "profiles are publicly readable"
  on public.profiles for select to anon, authenticated
  using (true);
create policy "users update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "active categories are public"
  on public.categories for select to anon, authenticated
  using (is_active or (select public.is_admin()));
create policy "admins manage categories"
  on public.categories for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "tags are public"
  on public.tags for select to anon, authenticated
  using (true);
create policy "admins manage tags"
  on public.tags for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "published stories and owners are readable"
  on public.stories for select to anon, authenticated
  using (
    (status = 'published' and is_hidden = false)
    or author_id = (select auth.uid())
    or (select public.is_admin())
  );
create policy "authors create their own stories"
  on public.stories for insert to authenticated
  with check (
    (
      author_id = (select auth.uid())
      and is_featured = false
      and is_hidden = false
    )
    or (select public.is_admin())
  );
create policy "authors and admins update stories"
  on public.stories for update to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()))
  with check (author_id = (select auth.uid()) or (select public.is_admin()));
create policy "authors and admins delete stories"
  on public.stories for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

create policy "visible story tags are readable"
  on public.story_tags for select to anon, authenticated
  using (
    exists (
      select 1
        from public.stories as stories
        where stories.id = story_tags.story_id
          and (
            (stories.status = 'published' and stories.is_hidden = false)
            or stories.author_id = (select auth.uid())
            or (select public.is_admin())
          )
    )
  );
create policy "authors tag their own stories"
  on public.story_tags for insert to authenticated
  with check (
    exists (
      select 1
        from public.stories as stories
        where stories.id = story_tags.story_id
          and stories.author_id = (select auth.uid())
    )
    or (select public.is_admin())
  );
create policy "authors remove tags from their own stories"
  on public.story_tags for delete to authenticated
  using (
    exists (
      select 1
        from public.stories as stories
        where stories.id = story_tags.story_id
          and stories.author_id = (select auth.uid())
    )
    or (select public.is_admin())
  );

create policy "likes on published stories are public"
  on public.likes for select to anon, authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
        from public.stories as stories
        where stories.id = likes.story_id
          and stories.status = 'published'
          and stories.is_hidden = false
    )
    or (select public.is_admin())
  );
create policy "users like published stories"
  on public.likes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
        from public.stories as stories
        where stories.id = likes.story_id
          and stories.status = 'published'
          and stories.is_hidden = false
    )
  );
create policy "users remove their own likes"
  on public.likes for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "visible comments and authors are readable"
  on public.comments for select to anon, authenticated
  using (
    (
      is_hidden = false
      and exists (
        select 1
          from public.stories as stories
          where stories.id = comments.story_id
            and stories.status = 'published'
            and stories.is_hidden = false
      )
    )
    or author_id = (select auth.uid())
    or (select public.is_admin())
  );
create policy "users comment on published stories"
  on public.comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and is_hidden = false
    and exists (
      select 1
        from public.stories as stories
        where stories.id = comments.story_id
          and stories.status = 'published'
          and stories.is_hidden = false
    )
  );
create policy "authors and admins update comments"
  on public.comments for update to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()))
  with check (author_id = (select auth.uid()) or (select public.is_admin()));
create policy "authors and admins delete comments"
  on public.comments for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

create policy "users read their own bookmarks"
  on public.bookmarks for select to authenticated
  using (user_id = (select auth.uid()));
create policy "users bookmark published stories"
  on public.bookmarks for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
        from public.stories as stories
        where stories.id = bookmarks.story_id
          and stories.status = 'published'
          and stories.is_hidden = false
    )
  );
create policy "users remove their own bookmarks"
  on public.bookmarks for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "follows are public"
  on public.follows for select to anon, authenticated
  using (true);
create policy "users follow other profiles"
  on public.follows for insert to authenticated
  with check (
    follower_id = (select auth.uid())
    and follower_id <> followed_id
  );
create policy "users unfollow their own follows"
  on public.follows for delete to authenticated
  using (follower_id = (select auth.uid()));

create policy "users read their own notifications"
  on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));
create policy "users mark their own notifications"
  on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));
create policy "users delete their own notifications"
  on public.notifications for delete to authenticated
  using (recipient_id = (select auth.uid()));

create policy "reporters and admins read reports"
  on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_admin()));
create policy "users submit reports for visible content"
  on public.reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and status = 'open'
    and reviewed_by is null
    and reviewed_at is null
    and (
      (
        story_id is not null
        and comment_id is null
        and exists (
          select 1
            from public.stories as stories
            where stories.id = reports.story_id
              and stories.status = 'published'
              and stories.is_hidden = false
        )
      )
      or (
        story_id is null
        and comment_id is not null
        and exists (
          select 1
            from public.comments as comments
            join public.stories as stories on stories.id = comments.story_id
            where comments.id = reports.comment_id
              and comments.is_hidden = false
              and stories.status = 'published'
              and stories.is_hidden = false
        )
      )
    )
  );

create policy "users read their own history"
  on public.reading_history for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.profiles, public.categories, public.tags, public.stories,
  public.story_tags, public.likes, public.comments, public.bookmarks, public.follows,
  public.notifications, public.reports, public.reading_history
  from public, anon, authenticated;

grant select on public.profiles, public.categories, public.tags, public.stories,
  public.story_tags, public.likes, public.comments, public.follows
  to anon, authenticated;
grant select, update (username, full_name, avatar_path, bio)
  on public.profiles to authenticated;

grant insert (title, slug, excerpt, content, cover_path, category_id, status)
  on public.stories to authenticated;
grant update (title, slug, excerpt, content, cover_path, category_id, status)
  on public.stories to authenticated;
grant delete on public.stories to authenticated;

grant insert (name, slug, description, sort_order)
  on public.categories to authenticated;
grant update (name, slug, description, sort_order, is_active)
  on public.categories to authenticated;
grant delete on public.categories to authenticated;
grant insert (name, slug) on public.tags to authenticated;
grant update (name, slug) on public.tags to authenticated;
grant delete on public.tags to authenticated;

grant insert (story_id, tag_id) on public.story_tags to authenticated;
grant delete on public.story_tags to authenticated;
grant insert (story_id) on public.likes to authenticated;
grant delete on public.likes to authenticated;
grant insert (story_id, content) on public.comments to authenticated;
grant update (content) on public.comments to authenticated;
grant delete on public.comments to authenticated;
grant select, insert (story_id), delete on public.bookmarks to authenticated;
grant select, insert (followed_id), delete on public.follows to authenticated;
grant select, update (is_read), delete on public.notifications to authenticated;
grant select on public.reports to authenticated;
grant insert (story_id, comment_id, reason, details) on public.reports to authenticated;
grant select on public.reading_history to authenticated;

commit;
