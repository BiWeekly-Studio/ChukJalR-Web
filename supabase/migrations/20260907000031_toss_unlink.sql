-- Only a server-verified Toss callback may remove a Toss account.
create or replace function unlink_toss_user(p_user_key text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_uid uuid;
begin
  if p_user_key !~ '^[0-9]+$' then raise exception 'INVALID_USER_KEY'; end if;
  select id into v_uid from auth.users
    where email = p_user_key || '@toss.invalid'
      and raw_user_meta_data->>'toss_user_key' = p_user_key;
  if v_uid is null then return; end if;
  update chat_messages set deleted_at = now() where user_id = v_uid and deleted_at is null;
  delete from auth.users where id = v_uid;
end $$;
revoke all on function unlink_toss_user(text) from public, anon, authenticated;
grant execute on function unlink_toss_user(text) to service_role;
