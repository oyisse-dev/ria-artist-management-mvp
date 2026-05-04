grant execute on function public.current_user_role() to authenticated;
grant execute on function public.user_assigned_to_artist(uuid) to authenticated;
grant execute on function public.user_can_access_artist(uuid) to authenticated;
grant execute on function public.user_can_access_project(uuid) to authenticated;
grant execute on function public.project_progress(uuid) to authenticated;

revoke execute on function public.current_user_role() from anon, public;
revoke execute on function public.user_assigned_to_artist(uuid) from anon, public;
revoke execute on function public.user_can_access_artist(uuid) from anon, public;
revoke execute on function public.user_can_access_project(uuid) from anon, public;
revoke execute on function public.project_progress(uuid) from anon, public;
