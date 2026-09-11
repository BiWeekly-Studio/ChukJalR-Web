-- Only registration timing, no user data or authentication secrets.
create table public.supporter_callback_health (
 id integer primary key check (id=1),
 occurred_at text not null,
 received_at timestamptz not null default now()
);
alter table public.supporter_callback_health enable row level security;
revoke all on public.supporter_callback_health from anon,authenticated;
grant all on public.supporter_callback_health to service_role;
