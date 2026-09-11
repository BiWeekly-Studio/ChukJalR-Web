-- Run only within a transaction; caller appends ROLLBACK.
do $$
declare
 u uuid := gen_random_uuid(); u2 uuid := gen_random_uuid();
 sku text := 'ait.0000072177.d2cc5053.4c3aea389e.8761666150';
 snapshot jsonb; after_snapshot jsonb; result jsonb; before_id uuid; after_id uuid;
 fixture bigint; pred bigint;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,u||'@example.invalid','{}'),(u2,u2||'@example.invalid','{}');
 select jsonb_agg(to_jsonb(r)) into snapshot from ratings r where user_id=u;
 result := fresh_start_action(u,'status');
 assert jsonb_array_length(result->'challenges')=1, 'one free initial challenge';
 before_id := (result->'challenges'->0->>'id')::uuid;
 result := fresh_start_action(u,'grant','test-order-a',sku);
 result := fresh_start_action(u,'grant','test-order-a',sku);
 assert jsonb_array_length(result->'tickets')=1, 'idempotent grant';
 begin
   perform fresh_start_action(u2,'grant','test-order-a',sku);
   raise exception 'owner mismatch accepted';
 exception when others then assert sqlerrm='ORDER_OWNER_MISMATCH'; end;
 select id into fixture from fixtures limit 1;
 if fixture is not null then
   insert into predictions(user_id,fixture_id,pick,confidence) values(u,fixture,'HOME',1) returning id into pred;
 end if;
 result := fresh_start_action(u,'start','test-order-a',sku);
 after_id := (result->'challenges'->0->>'id')::uuid;
 assert before_id<>after_id, 'new challenge created';
 assert jsonb_array_length(result->'tickets')=0, 'ticket consumed';
 assert jsonb_array_length(result->'challenges')=2, 'old challenge preserved';
 result := fresh_start_action(u,'start','test-order-a',sku);
 assert (result->'challenges'->0->>'id')::uuid=after_id, 'idempotent consumption';
 if fixture is not null then
   assert (result->'challenges'->0->>'predicted')::int=0, 'pending predictions stay in previous challenge';
   assert exists(select 1 from predictions where id=pred), 'predictions preserved';
   insert into settlements(prediction_id,user_id,fixture_id,season,q_snapshot,p_user,actual,delta_rating,points)
     values(pred,u,fixture,2026,'{}','{}','HOME',20,10);
   result := fresh_start_action(u,'status');
   assert (result->'challenges'->0->>'settled')::int=0, 'late results cannot move to new challenge';
   assert (result->'challenges'->1->>'rating')::int=1020, 'late settlement stays in old challenge';
 end if;
 result := fresh_start_action(u,'refund','test-order-a',sku);
 assert not exists(select 1 from personal_challenges where user_id=u and ended_at is null), 'refunded challenge closes';
 result := fresh_start_action(u,'status');
 assert jsonb_array_length(result->'challenges')=2, 'refund must not mint a new free challenge';
 begin
   perform fresh_start_action(u,'start','test-order-a',sku);
   raise exception 'refunded order accepted';
 exception when others then assert sqlerrm='ORDER_REFUNDED'; end;
 result := fresh_start_action(u,'grant','test-order-b',sku);
 result := fresh_start_action(u,'refund','test-order-b',sku);
 assert jsonb_array_length(result->'tickets')=0, 'unused refunded ticket revoked';
 select jsonb_agg(to_jsonb(r)) into after_snapshot from ratings r where user_id=u;
 assert snapshot=after_snapshot, 'official rating, points and balance unchanged';
 delete from auth.users where id=u;
 assert exists(select 1 from fresh_start_orders where order_id='test-order-b' and user_id is null), 'detached transaction retained';
 begin
   perform fresh_start_action(u2,'grant','test-order-b',sku);
   raise exception 'deleted account order reused';
 exception when others then assert sqlerrm='ORDER_OWNER_MISMATCH'; end;
 assert not has_function_privilege('authenticated','public.fresh_start_action(uuid,text,text,text)','EXECUTE'), 'client cannot grant';
 assert not has_table_privilege('authenticated','public.fresh_start_orders','INSERT'), 'client cannot insert orders';
 assert not has_table_privilege('authenticated','public.personal_challenges','UPDATE'), 'client cannot reset challenges';
end $$;
select 'fresh-start assertions passed; all test changes rolled back' as result;
