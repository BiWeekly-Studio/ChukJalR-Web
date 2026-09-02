-- 엠블럼 URL 채우기
--
-- 이전 시즌 동기화 때 들어와 logo_url 이 비어 있는 팀들이 있다.
-- API-Football 의 CDN 경로는 팀 id 로 결정되므로 규칙으로 채운다.
-- 혹시 404 가 나도 클라이언트가 모노그램으로 떨어지므로 안전하다.

update teams
   set logo_url = 'https://media.api-sports.io/football/teams/' || id || '.png'
 where logo_url is null;
