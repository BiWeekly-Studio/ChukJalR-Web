-- 리그 엠블럼과 국기
-- API-Football 의 CDN 경로는 리그 id / 국가 코드로 결정된다. 네 개 다 확인했다.

alter table leagues add column if not exists logo_url text;
alter table leagues add column if not exists flag_url text;

update leagues set
  logo_url = 'https://media.api-sports.io/football/leagues/' || id || '.png',
  flag_url = case id
    when 39  then 'https://media.api-sports.io/flags/gb-eng.svg'
    when 140 then 'https://media.api-sports.io/flags/es.svg'
    when 78  then 'https://media.api-sports.io/flags/de.svg'
    when 135 then 'https://media.api-sports.io/flags/it.svg'
  end;
