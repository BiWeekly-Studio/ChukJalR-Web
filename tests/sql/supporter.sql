-- Fixtures and roles are provided by the test harness; rollback after execution.
do $$
declare
 u uuid := '00000000-0000-0000-0000-000000000001';
 u2 uuid := '00000000-0000-0000-0000-000000000002';
 t timestamptz := now();
begin
 insert into profiles(id) values(u),(u2);
 insert into teams(id) values(1);
 insert into supporter_profiles values(u,1);
 -- A payment webhook may precede the authenticated purchase grant.
 perform supporter_payment_event('order','monthly','ACTIVE',true,t+interval '30 days',true,t);
 assert not (supporter_snapshot(u)->>'active')::boolean;
 perform supporter_bind_order(u,'order','monthly');
 assert (supporter_snapshot(u)->>'active')::boolean;
 assert (select count(*) from supporter_badges(array[u]))=1;
 begin
   perform supporter_bind_order(u2,'order','monthly');
   raise exception 'owner mismatch accepted';
 exception when others then assert sqlerrm='ORDER_OWNER_MISMATCH'; end;
 -- Cancel renewal keeps the paid period.
 perform supporter_payment_event('order','monthly','ACTIVE',true,t+interval '30 days',false,t+interval '1 second');
 assert (supporter_snapshot(u)->>'active')::boolean;
 assert not (supporter_snapshot(u)->>'autoRenew')::boolean;
 -- Reordered and duplicated notifications cannot roll state backward.
 perform supporter_payment_event('order','monthly','ACTIVE',true,t+interval '30 days',true,t);
 assert not (supporter_snapshot(u)->>'autoRenew')::boolean;
 perform supporter_payment_event('order','monthly','REVOKED',false,t,false,t+interval '2 seconds');
 assert not (supporter_snapshot(u)->>'active')::boolean;
 assert (select count(*) from supporter_badges(array[u]))=0;
 perform supporter_payment_event('order','monthly','ACTIVE',true,t+interval '30 days',true,t);
 assert not (supporter_snapshot(u)->>'active')::boolean;
 perform supporter_bind_order(u,'pending','monthly');
 assert (supporter_snapshot(u)->>'pending')::boolean;
 perform supporter_payment_event('pending','monthly','ACTIVE',true,t-interval '1 second',false,t);
 assert not (supporter_snapshot(u)->>'active')::boolean;
 assert not (supporter_snapshot(u)->>'pending')::boolean;
 delete from profiles where id=u;
 begin
   perform supporter_bind_order(u2,'order','monthly');
   raise exception 'deleted order rebound';
 exception when others then assert sqlerrm='ORDER_OWNER_MISMATCH'; end;
 assert not has_table_privilege('authenticated','supporter_orders','SELECT');
 assert not has_table_privilege('authenticated','supporter_profiles','INSERT');
 assert not has_function_privilege('authenticated','supporter_bind_order(uuid,text,text)','EXECUTE');
 assert not has_function_privilege('authenticated','supporter_payment_event(text,text,text,boolean,timestamptz,boolean,timestamptz)','EXECUTE');
 assert has_function_privilege('authenticated','supporter_badges(uuid[])','EXECUTE');
end;
$$;
