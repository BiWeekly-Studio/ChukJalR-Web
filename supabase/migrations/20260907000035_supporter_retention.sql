-- Same retention period as existing paid items; detached records cannot be rebound.
select cron.schedule('purge-detached-supporter-orders', '30 18 * * *',
  $job$delete from public.supporter_orders where user_id is null
    and greatest(created_at,event_at,bound_at,expires_at) < now() - interval '5 years'$job$);
