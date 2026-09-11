-- Match the existing five-year retention policy after account deletion.
select cron.schedule('purge-detached-apple-purchases','40 18 * * *',
  $job$delete from public.apple_purchases where user_id is null
    and greatest(purchased_at,expires_at,revoked_at,signed_at) < now() - interval '5 years'$job$);
