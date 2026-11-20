begin;

create or replace function public.is_user_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select auth.role()) = 'service_role'
    and exists (
      select 1
      from private.user_roles as roles
      where roles.user_id = p_user_id
        and roles.role = 'admin'
    );
$function$;

revoke all on function public.is_user_admin(uuid) from public, anon, authenticated;
grant execute on function public.is_user_admin(uuid) to service_role;

commit;
