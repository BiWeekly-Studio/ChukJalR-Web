-- Supabase default privileges grant RPC execution explicitly to API roles.
-- Revoking PUBLIC alone does not remove those role-specific grants.
revoke all on function public.supporter_snapshot(uuid) from public,anon,authenticated;
revoke all on function public.supporter_bind_order(uuid,text,text) from public,anon,authenticated;
revoke all on function public.supporter_payment_event(text,text,text,boolean,timestamptz,boolean,timestamptz) from public,anon,authenticated;
revoke all on function public.supporter_badges(uuid[]) from public,anon;
grant execute on function public.supporter_snapshot(uuid), public.supporter_bind_order(uuid,text,text), public.supporter_payment_event(text,text,text,boolean,timestamptz,boolean,timestamptz) to service_role;
grant execute on function public.supporter_badges(uuid[]) to authenticated;
