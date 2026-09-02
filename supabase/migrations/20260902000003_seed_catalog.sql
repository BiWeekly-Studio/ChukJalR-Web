-- 리그·팀 시드
-- 팀 id 는 API-Football 의 실제 id 다. 나중에 sync-fixtures 가 upsert 로 덮어써도
-- 충돌하지 않고 이름·약어만 갱신된다. API 키 없이도 앱을 돌려보기 위한 최소 카탈로그.

insert into leagues (id, name, short_name, country) values
  (39,  '프리미어리그', '프리미어', '잉글랜드'),
  (140, '라리가',      '라리가',   '스페인'),
  (78,  '분데스리가',  '분데스',   '독일'),
  (135, '세리에 A',    '세리에A',  '이탈리아')
on conflict (id) do update
  set name = excluded.name, short_name = excluded.short_name, country = excluded.country;

insert into teams (id, league_id, name, abbr, color, tint) values
  (42,  39,  '아스날',        'ARS', '#C8102E', '#F7E4E3'),
  (50,  39,  '맨시티',        'MCI', '#33608F', '#E4EDF6'),
  (40,  39,  '리버풀',        'LIV', '#B01C33', '#F7E4E6'),
  (51,  39,  '브라이턴',      'BHA', '#2A63A8', '#E5EDF8'),
  (49,  39,  '첼시',          'CHE', '#2B4C8C', '#E6EBF6'),
  (47,  39,  '토트넘',        'TOT', '#4A5568', '#ECEEF2'),
  (541, 140, '레알 마드리드', 'RMA', '#4A5568', '#EDEFF3'),
  (529, 140, '바르셀로나',    'BAR', '#7A2A55', '#F4E6EE'),
  (530, 140, '아틀레티코',    'ATM', '#C0392B', '#F8E6E3'),
  (532, 140, '발렌시아',      'VAL', '#C98A19', '#FBF1DC'),
  (157, 78,  '바이에른',      'FCB', '#B8202E', '#F8E5E6'),
  (165, 78,  '도르트문트',    'BVB', '#B08A00', '#FAF3D8'),
  (168, 78,  '레버쿠젠',      'B04', '#B01F2E', '#F8E4E6'),
  (172, 78,  '슈투트가르트',  'VFB', '#4C7BA8', '#E7EFF7'),
  (505, 135, '인터',          'INT', '#2B4C8C', '#E6EBF6'),
  (489, 135, 'AC 밀란',       'MIL', '#B0202E', '#F8E5E6'),
  (496, 135, '유벤투스',      'JUV', '#3A3A3A', '#ECECEC'),
  (492, 135, '나폴리',        'NAP', '#2E7BB8', '#E5EFF8')
on conflict (id) do update
  set name = excluded.name, abbr = excluded.abbr;
