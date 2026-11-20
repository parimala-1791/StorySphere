begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'profile-pictures',
    'profile-pictures',
    true,
    2097152,
    array['image/avif', 'image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'story-covers',
    'story-covers',
    false,
    5242880,
    array['image/avif', 'image/jpeg', 'image/png', 'image/webp']
  )
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "profile pictures are publicly readable"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'profile-pictures');

create policy "users upload their own profile pictures"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profile-pictures'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 1
  );

create policy "users update their own profile pictures"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'profile-pictures'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 1
  )
  with check (
    bucket_id = 'profile-pictures'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 1
  );

create policy "users delete their own profile pictures"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'profile-pictures'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_admin())
    )
  );

create policy "published story covers and owners are readable"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'story-covers'
    and (
      exists (
        select 1
          from public.stories as stories
          where stories.id::text = (storage.foldername(name))[2]
            and stories.author_id::text = (storage.foldername(name))[1]
            and (
              stories.author_id = (select auth.uid())
              or (stories.status = 'published' and stories.is_hidden = false)
            )
      )
      or (select public.is_admin())
    )
  );

create policy "authors upload covers to their own stories"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'story-covers'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
        from public.stories as stories
        where stories.id::text = (storage.foldername(name))[2]
          and stories.author_id = (select auth.uid())
    )
  );

create policy "authors update covers for their own stories"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'story-covers'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
        from public.stories as stories
        where stories.id::text = (storage.foldername(name))[2]
          and stories.author_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'story-covers'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
        from public.stories as stories
        where stories.id::text = (storage.foldername(name))[2]
          and stories.author_id = (select auth.uid())
    )
  );

create policy "authors and admins delete story covers"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'story-covers'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_admin())
    )
  );

commit;
