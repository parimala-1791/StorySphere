do $test$
declare
  app_table text;
  app_table_oid regclass;
begin
  foreach app_table in array array[
    'public.profiles',
    'public.categories',
    'public.tags',
    'public.stories',
    'public.story_categories',
    'public.story_tags',
    'public.likes',
    'public.comments',
    'public.bookmarks',
    'public.follows',
    'public.notifications',
    'public.reports',
    'public.reading_history',
    'private.user_roles'
  ]
  loop
    app_table_oid := to_regclass(app_table);
    if app_table_oid is null then
      raise exception 'Required table is missing: %', app_table;
    end if;

    if not exists (
      select 1
        from pg_class
        where oid = app_table_oid
          and relrowsecurity
    ) then
      raise exception 'Row Level Security is not enabled on %', app_table;
    end if;

    if not exists (
      select 1
        from pg_policies
        where schemaname = split_part(app_table, '.', 1)
          and tablename = split_part(app_table, '.', 2)
    ) and app_table <> 'private.user_roles' then
      raise exception 'No RLS policies were found for %', app_table;
    end if;
  end loop;

  if has_table_privilege('anon', 'private.user_roles', 'select')
    or has_table_privilege('authenticated', 'private.user_roles', 'select')
  then
    raise exception 'Application roles must not read the trusted role table directly';
  end if;

  if has_column_privilege('authenticated', 'public.stories', 'is_hidden', 'update')
    or has_column_privilege('authenticated', 'public.stories', 'is_featured', 'update')
  then
    raise exception 'Story moderation fields must only be changed through the checked RPC';
  end if;

  if has_column_privilege('authenticated', 'public.comments', 'is_hidden', 'update') then
    raise exception 'Comment moderation fields must only be changed through the checked RPC';
  end if;

  if has_function_privilege(
    'anon',
    'public.set_story_moderation(uuid,boolean,boolean)',
    'execute'
  ) or has_function_privilege(
    'anon',
    'public.set_comment_moderation(uuid,boolean)',
    'execute'
  ) or has_function_privilege(
    'anon',
    'public.review_report(uuid,text)',
    'execute'
  ) then
    raise exception 'Anonymous users must not execute moderation functions';
  end if;

  if has_function_privilege(
    'anon',
    'public.is_user_admin(uuid)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.is_user_admin(uuid)',
    'execute'
  ) or not has_function_privilege(
    'service_role',
    'public.is_user_admin(uuid)',
    'execute'
  ) then
    raise exception 'Only trusted server operations may inspect another user''s admin role';
  end if;

  if not has_function_privilege(
    'anon',
    'public.get_story_feed(text,text,text,integer,integer,boolean,integer)',
    'execute'
  ) then
    raise exception 'Anonymous readers must be able to query the published story feed';
  end if;

  if not has_function_privilege(
    'anon',
    'public.get_profile_story_feed(text,integer,integer)',
    'execute'
  ) then
    raise exception 'Anonymous readers must be able to query published writer stories';
  end if;

  if has_function_privilege(
    'anon',
    'public.set_story_categories(uuid,uuid[])',
    'execute'
  ) or not has_function_privilege(
    'authenticated',
    'public.set_story_categories(uuid,uuid[])',
    'execute'
  ) then
    raise exception 'Story category synchronization must only be available to authenticated users';
  end if;

  if not has_function_privilege(
    'anon',
    'public.can_read_story_category_assignment(uuid)',
    'execute'
  ) or not has_function_privilege(
    'authenticated',
    'public.can_read_story_category_assignment(uuid)',
    'execute'
  ) then
    raise exception 'Category visibility policy helper must be available to readers';
  end if;

  if not exists (
    select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'categories'
        and policyname = 'categories assigned to readable stories are visible'
        and qual like '%can_read_story_category_assignment%'
  ) then
    raise exception 'Category visibility policy must use the recursion-safe helper';
  end if;

  if has_function_privilege('anon', 'public.record_story_read(uuid)', 'execute')
    or not has_function_privilege(
      'authenticated',
      'public.record_story_read(uuid)',
      'execute'
    )
  then
    raise exception 'Reading history must only be recorded by authenticated readers';
  end if;

  if not exists (
    select 1 from storage.buckets
    where id = 'profile-pictures' and public = true and file_size_limit = 2097152
  ) then
    raise exception 'Profile picture bucket configuration is incorrect';
  end if;

  if not exists (
    select 1 from storage.buckets
    where id = 'story-covers' and public = false and file_size_limit = 5242880
  ) then
    raise exception 'Story cover bucket configuration is incorrect';
  end if;
end;
$test$;
