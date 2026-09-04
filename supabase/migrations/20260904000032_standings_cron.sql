-- 순위표를 하루 한 번 받는다
--
-- 화면에 등수를 띄우기 시작하면서 주 1회로는 낡는다 — 주중 경기 뒤 하루 이틀 지난
-- 값이 보인다. 리그당 1회, 하루 4회. Pro 플랜 한도(7,500/일)에서는 무시할 양이다.
-- 유럽 경기가 다 끝난 뒤로 잡는다 (KST 12:00).
select cron.schedule('sync-standings', '0 3 * * *', $$ select invoke_sync('standings'); $$);

-- 기준 확률은 이제 API 를 부르지 않고 저장된 표를 읽는다. 순위표가 갱신된 뒤에
-- 돌도록 30분 뒤로 옮긴다.
select cron.unschedule('sync-priors');
select cron.schedule('sync-priors', '30 3 * * *', $$ select invoke_sync('priors'); $$);
