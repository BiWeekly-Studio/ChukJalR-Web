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
| 토스 로그인만 허용 | 미니앱 빌드(`VITE_AUTH_MODE` 비움)에서는 로그인 화면 자체가 렌더되지 않는다. 소셜·이메일 로그인은 자체 배포(`standalone`)에서만 열린다 (`src/lib/env.ts`) |
| LocalStorage는 앱 삭제 시 소실 | 캐시로만 사용, 서버 동기화 전제 (`store.tsx` 주석) |
| 서드파티 쿠키 차단 | 쿠키 세션 금지 → 토큰 기반 인증으로 설계 |
| `wss://` 만 허용 | 채팅 실시간 연결은 wss 전제 (`MatchDetail.tsx` 주석) |
| API 3,000 req/min | 폴링 대신 WebSocket 구독으로 설계 |
| 외부 광고·외부 링크 금지 | 광고 SDK, 외부 링크 없음 |

## 로그인 — 배포 대상이 둘이다

`VITE_AUTH_MODE` 하나로 갈린다. **비워두면 `toss`** — 플래그를 깜빡했을 때 심사에 걸리는
쪽이 아니라 안전한 쪽으로 넘어지게 한 것이다.

| | `toss` (미니앱) | `standalone` (자체 웹·앱) |
| --- | --- | --- |
| 세션 확보 | 토스 로그인 브리지가 JWT 발급 (명세 14.5) | 소셜 / 이메일 로그인 |
| 세션 없을 때 화면 | "로그인을 확인하지 못했어요" | 로그인 화면 |
| 소셜 버튼 | 없음 | 대시보드에서 켠 provider 만 |
| '나' 탭 계정 칸 | 없음 (계정 = 토스 계정) | 있음 (로그아웃) |

**로그인은 필수다.** 둘러보기용 익명(게스트) 세션은 두지 않는다 — 기기를 옮기는 순간
사라지는 계정에 예측 기록과 순위가 쌓이면, 그걸 잃었을 때 되돌릴 방법이 없다.
Supabase 대시보드의 **Authentication → Anonymous sign-ins 도 함께 꺼둘 것.**
앱에서 호출하지 않더라도 켜져 있으면 anon 키로 익명 계정을 만들 수 있다.

소셜 버튼 목록은 코드에 박지 않고 `/auth/v1/settings` 를 읽어 만든다 — 대시보드에서
provider 를 켜면 버튼이 저절로 생기고, 꺼져 있으면 아예 그리지 않는다. 눌러도 안 되는
버튼을 띄우지 않으려는 것이다.

### 소셜 로그인을 켜려면 (아직 안 되어 있음)

코드는 다 깔려 있고, 남은 건 전부 콘솔 작업이다.

1. **제공자 콘솔에서 앱 등록** → client ID / secret 발급
   - 카카오: 카카오디벨로퍼스. 한국 서비스면 이게 1순위다
   - 구글: Google Cloud Console → OAuth 2.0 클라이언트
   - 애플: Apple Developer → Sign in with Apple.
     **iOS 앱에 다른 소셜 로그인을 넣으면 애플 로그인도 함께 넣어야 심사를 통과한다**
2. **Supabase 대시보드** → Authentication → Sign In / Providers 에서 해당 provider 를 켜고
   위에서 받은 키를 넣는다. 콜백 주소는 `<PROJECT_URL>/auth/v1/callback`
3. **Redirect URLs** 에 돌아올 주소를 등록한다 (Authentication → URL Configuration).
   개발 중이면 `http://localhost:3001`, 앱이면 딥링크 스킴
4. `.env` 에 `VITE_AUTH_MODE=standalone`

> **네이버는 Supabase 가 기본 제공하지 않는다.** 넣으려면 커스텀 OIDC 나 Auth Hook 을
> 따로 붙여야 한다 — 카카오·구글·애플과 달리 별도 작업이다.

닉네임은 제공자마다 실려 오는 키가 달라서(`nickname` / `preferred_username` / `full_name`
/ `name`) `20260902000015_social_handle.sql` 이 순서대로 훑고, 없으면 자동 생성한다.
**이 마이그레이션도 실제 Postgres 에서 실행해 검증하지 못했다** (이 머신에 컨테이너 런타임 없음).

## 지어낸 값을 만들지 않는다

화면에 숫자가 비면 그럴듯한 기본값으로 메우고 싶어지는데, 그 순간 유저에게 없는 사실을
보여주게 된다. 그래서 다음을 규칙으로 둔다.

- **모르는 값은 `null` 로 둔다.** `baseline` · `participants` · `topPercent` · `tier` ·
  `round` · `venue` · 뱃지 `target` 이 그렇다. 화면은 null 이면 그 자리를 그리지 않는다.
- **집계 호출 실패를 삼키지 않는다.** `live_baselines` 응답의 `error` 를 무시하면 전 경기가
  같은 값을 달고 나가면서도 아무도 눈치채지 못한다. 실패는 콘솔에 남기고 분포 없이 그린다.
- **기준선은 여론이 아니다.** `compute_baseline` 은 예측이 0명이어도 prior 로 값을 돌려준다
  (가중치 `w = 30/(30+n)`). 점수 계산의 근거로는 진짜지만, 표본이 적으면 그 값의 대부분은
  기본 예상치다. 그래서 `src/lib/baseline.ts` 가 표본 수로 셋을 가른다.

  | 참여자 | 화면 |
  | --- | --- |
  | 0명 | 분포를 그리지 않는다. "아직 아무도 예측하지 않았어요" |
  | 1–29명 | "지금까지의 예상 확률" + 표본이 적다고 밝힌다 |
  | 30명 이상 | "다른 사람들은 이렇게 봤어요" |

  30이라는 경계는 `freeze_baseline` 이 `prior-heavy` / `blend` 를 가르는 값과 같다.

> `fixture_priors` 가 비어 있으면 `compute_baseline` 이 모든 경기에 같은 일반 prior
> `[0.45, 0.26, 0.29]` 를 쓴다. 그러면 어느 경기를 눌러도 홈 45% 가 나와서 예측할 맛이
> 없어진다. **출시 전에 경기별 prior 를 채워야 한다.**

## 토스 로그인

앱인토스 빌드(`VITE_AUTH_MODE` 비움)의 유일한 로그인 경로다. 흐름은 이렇다.

```
미니앱                     Edge Function(toss-login)          토스 서버 API
  TossAuth.login()
  → authorizationCode  ──▶  generate-token (mTLS)      ──▶  accessToken
                            login-me (mTLS + Bearer)   ──▶  userKey
                            userKey → Supabase 유저 찾기/만들기
  setSession()         ◀──  access_token / refresh_token
```

- 클라이언트 SDK 는 `@apps-in-toss/web-framework` 의 `TossAuth.login()` 이다.
  680KB 라서 정적으로 import 하지 않고 버튼을 누를 때 동적으로 부른다 — 자체 배포
  번들에는 들어가지 않고, 미니앱에서도 첫 화면 로딩을 늦추지 않는다.
- **토큰 교환은 반드시 서버에서 한다.** 토스 서버 API 는 mTLS 클라이언트 인증서로 호출
  주체를 확인하므로, 인증서와 개인 키를 클라이언트에 둘 수 없다.
- `userKey` 는 토스가 주는 고유 식별자다. 이걸로 `<userKey>@toss.invalid` 라는 합성
  이메일의 Supabase 유저를 만들고, 비밀번호는 `HMAC(TOSS_AUTH_PEPPER, userKey)` 로
  매번 다시 유도한다 — 어디에도 저장하지 않고, pepper 를 모르면 만들 수 없다.

### 배포 전에 해야 할 것

1. 토스 콘솔에서 **mTLS 클라이언트 인증서** 발급, 로그인 사용 신청
2. 시크릿 등록 — `TOSS_CLIENT_CERT` · `TOSS_CLIENT_KEY` · `TOSS_AUTH_PEPPER`
3. `supabase functions deploy toss-login`
4. **`Deno.createHttpClient` 지원 여부 확인.** mTLS 를 이 API 로 거는데 불안정 API 라,
   Edge Function 런타임이 지원하지 않으면 `MTLS_UNSUPPORTED` 를 돌려준다.
   지원하지 않으면 이 교환만 다른 호스트로 옮겨야 한다.

> 여기까지는 **토스 앱 안에서만 끝까지 시험할 수 있다.** 브라우저에서는 SDK 가
> "apps-in-toss 웹뷰 환경이 아니에요" 로 거절하는 것까지 확인했다.

## 첫 실행 안내

별도 튜토리얼 화면 대신 홈 위에 코치마크를 띄운다 (`src/components/Coachmarks.tsx`).
규칙의 핵심이 '보기를 누르면 확신도가 열린다'는 손의 동작이라, 읽는 것보다 한 번
눌러보는 편이 빠르다. 강조된 구멍 안은 실제로 눌리고, 사용자가 보기를 고르면 확신도
단계가 나타나는 것을 감지해 다음으로 넘어간다. 대상을 `data-tour` 로 찾으므로 오늘 경기가
없어 카드가 없으면 그 단계는 저절로 건너뛴다.

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
