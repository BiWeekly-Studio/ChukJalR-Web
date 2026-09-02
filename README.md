# 축잘알 — 웹 클라이언트

유럽 4대 리그 승부 예측 게임. 앱인토스(미니앱) 배포를 전제로 만든 React SPA다.

## 실행

```bash
npm install
npm run dev      # 개발 서버
npm run build    # 타입체크 + 프로덕션 빌드
npm run preview  # 빌드 결과 확인
npm test         # 점수 공식 검증
```

## 구조

```
src/
  lib/scoring.ts          점수 엔진 — 기술 명세 2장의 공식 (이 앱의 핵심)
  lib/format.ts           숫자·시각 표기
  data/repository.ts      화면이 데이터를 얻는 유일한 통로 (인터페이스)
  data/mockRepository.ts  백엔드 없이 도는 구현
  data/supabaseRepository.ts  실제 구현
  data/index.ts           환경변수 보고 둘 중 하나를 고른다
  data/catalog.ts         리그·팀·경기 레지스트리 (출처를 화면이 몰라도 되게)
  data/mock.ts            목업 데이터
  store.tsx               앱 상태 + 부팅 로딩
  components/             Crest, MatchCard, 아이콘
  screens/                Onboarding, Predict, MatchDetail, Profile, Ranking
  styles.css              디자인 토큰 (→ tokens.json 으로 Compose/SwiftUI와 공유)

supabase/
  migrations/             스키마 + RLS + 점수 엔진 + pg_cron
  functions/sync-fixtures 　API-Football 수집기 (schedule / live 두 모드)
```

## 백엔드 붙이기

목업으로도 전부 돌아간다. Supabase 를 붙이려면:

1. **Supabase 프로젝트 생성** (리전: Seoul `ap-northeast-2`)
2. **마이그레이션 적용** — `supabase link --project-ref <ref>` 후 `supabase db push`
3. **API-Football 키 발급** ([api-football.com](https://www.api-football.com/pricing)) 후 시크릿 등록
   ```bash
   supabase secrets set API_FOOTBALL_KEY=...
   supabase functions deploy sync-fixtures
   ```
4. **수집 스케줄** — API 호출을 아끼는 것이 설계 목표다
   ```
   sync-fixtures?mode=schedule   # 주 1회, 향후 1개월 일정      4회
   sync-fixtures?mode=teams      # 월 1회, 팀 카탈로그          4회
   sync-fixtures?mode=results    # 10분마다, 열린 경기만 id 지정  0~2회
   ```
   `results` 는 예측 창이 열려 있고 아직 안 끝난 경기가 없으면 **API 를 아예 부르지 않는다.**
   주당 약 225회, 하루 평균 32회 — 무료 플랜(100회/일)으로도 돈다.
5. **`.env` 채우기** — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

환경변수가 비어 있으면 supabase-js 는 번들에서 트리셰이킹으로 통째로 빠진다.
목업 모드 번들이 가벼운 이유다.

> 마이그레이션은 작성만 했고 **실제 Postgres 에서 실행해 검증하지는 못했다** (이 머신에
> 컨테이너 런타임이 없음). 첫 `db push` 에서 문법 오류가 날 수 있으니 로컬이나
> 스테이징 프로젝트에 먼저 적용할 것.

## 앱인토스 제약이 코드에 반영된 지점

| 제약 | 반영 |
| --- | --- |
| SSR 금지, CSR/SSG만 | Vite SPA, 서버 렌더링 없음 (`vite.config.ts`) |
| 다크모드 미지원 | `color-scheme: light` 고정, 라이트 단일 팔레트 (`styles.css`) |
| Safe Area 미적용 시 심사 반려 | `viewport-fit=cover` + `env(safe-area-inset-*)` 토큰 |
| 첫 화면 10초 이내 | 초기 번들 gzip 58KB, 외부 의존성 없음 |
| 번들 100MB 이하 | 현재 190KB |
| 토스 로그인만 허용 | 온보딩에 계정 생성·소셜 로그인 단계 없음 |
| LocalStorage는 앱 삭제 시 소실 | 캐시로만 사용, 서버 동기화 전제 (`store.tsx` 주석) |
| 서드파티 쿠키 차단 | 쿠키 세션 금지 → 토큰 기반 인증으로 설계 |
| `wss://` 만 허용 | 채팅 실시간 연결은 wss 전제 (`MatchDetail.tsx` 주석) |
| API 3,000 req/min | 폴링 대신 WebSocket 구독으로 설계 |
| 외부 광고·외부 링크 금지 | 광고 SDK, 외부 링크 없음 |

## 아직 목업인 것

- 데이터 출처 (`VITE_SUPABASE_*` 미설정 시 `src/data/mock.ts`)
- 채팅은 9초마다 가짜 메시지가 들어온다 (Realtime Broadcast 대체물)
- 리그별 적중률·캘리브레이션·팬심 편향은 집계 뷰가 붙기 전까지 표본값
- 라이브 스코어 실시간 갱신은 하지 않는다 (호출량을 줄이려 의도적으로 포기)

## 예측 창

예측은 **매치데이가 열린 경기**에만 가능하다. 매치데이는 자정이 아니라 **KST 06:00** 에
시작한다 — 유럽 경기가 한국 시간 새벽이라 자정으로 자르면 토요일 밤에 일요일 새벽 경기를
예측할 수 없게 된다. 06:00 경계면 토요일 아침부터 일요일 새벽 킥오프까지 한 매치데이로
22시간이 이어진다. 서버는 `fixtures.opens_at` 에 저장하고 RLS 가 이 창을 강제한다.
- 정산·레벨업·뱃지 획득 연출 화면 미구현
- 상점, 미션, 리그 순서 드래그 정렬 미구현
- 팀 엠블럼은 팀 컬러 + 약어 모노그램 플레이스홀더 (라이선스 확인 전)

## 점수 엔진을 고칠 때

`src/lib/scoring.ts` 를 수정하면 `tests/scoring.test.mjs` 가 깨진다. 이건 의도된 것이다 —
점수 공식은 출시 후 바꾸면 지수의 의미가 무너지므로, 바꿀 때마다 명세 2.5 표와 대조해야 한다.
