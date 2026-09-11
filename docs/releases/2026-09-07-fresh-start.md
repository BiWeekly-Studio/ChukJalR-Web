# 새 출발권 · 앱인토스 배포 기록

## 상품과 동작

- 상품명: 새 출발권 1회 / 소모품 / 판매가 1,100원 (공급가 1,000원).
- 콘솔 상품 ID: `ait.0000072177.d2cc5053.4c3aea389e.8761666150`.
- 콘솔 설명 수정 확인: 개인 도전을 새로 시작해요. 공식 점수·랭킹·기존 기록은 유지돼요.
- 나 탭 → 개인 도전에서 구매, 지급된 이용권을 별도로 확인 후 사용.
- 개인 도전 지수만 1,000부터 새로 집계한다. 공식 ratings, settlements, predictions, point_ledger를 수정하지 않는다.
- 시작 전에 제출한 예측은 이후 정산되어도 이전 도전에 속한다. 이전 도전 목록을 유지한다.
- 앱 실행과 개인 도전 진입 시 미결 주문 복구. 서버 지급 성공 후 SDK에 지급 완료를 통지한다.
- 환불 주문은 이용권을 회수하고 사용된 개인 도전을 종료한다. 공식 기록은 유지한다.

## 서버

- Supabase project: `nqkytgbbvlemeoljibmf`, 서울 리전.
- `20260907000032_fresh_start.sql`: 주문 원장과 개인 도전, 서비스 역할 전용 원자적 RPC.
- `20260907000033_fresh_start_retention.sql`: 탈퇴 후 재지급 방지, 계정 연결 제거 및 거래 보관 기간 이후 정기 파기.
- Edge Functions `fresh-start`, `toss-login` 배포.
- 모든 결제 요청은 Supabase auth.getUser로 검증하며 server-owned app_metadata에서 Toss userKey를 가져온다.
- 토스 mTLS 주문 상태 API에 x-toss-user-key를 반드시 전달한다. 주문번호·SKU·결제 상태 확인 후 지급한다.
- 주문번호 PK, 사용자 행 잠금, 사용 시각으로 중복 지급·동시 소비·재시도를 처리한다.
- 직접 클라이언트 쓰기/실행 권한은 없다. 계정 삭제 후 주문을 재청구할 수 없다.

## 검증

- `npm test`: 33개 통과 (SDK 지급 실패/복구/취소/지원 여부 및 서버 주문 검증 포함).
- `tests/sql/fresh-start.sql`: 연결된 PostgreSQL에서 transaction/ROLLBACK으로 검증. 중복 지급·중복 사용·다른 계정 주문·환불·탈퇴 후 재지급·기존 예측 보존·늦은 정산의 이전 도전 귀속·공식 rating/points/balance 보존·권한 차단 통과.
- `node scripts/verify-fresh-start.mjs`: 실제 배포된 Edge에서 임시 테스트 계정으로 status, 인증 거부, 직접 RPC 거부, mTLS 없는 주문 거부 확인. 테스트 계정 삭제 완료. 실제 결제는 실행하지 않음.
- `npm run build:web`, `npm run build:toss:iap`: 통과. 웹/독립 앱에는 Toss 구매 UI를 노출하지 않음.
- `tests/ui/fresh-start.html`: 별도 Vite 설정의 모의 SDK로 실제 컴포넌트의 구매 → 보유 1장 → 사용 확인 → 개인 지수 1,000 → 이전 도전 1,080 유지 흐름을 Chrome에서 확인.
- **남은 실기기 검증**: 토스 SDK의 실제 상품 목록/결제창, 샌드박스 지급 성공 및 실패 후 복구. 모의 UI/서버 테스트가 실제 결제 E2E를 대신하지 않는다.

## 빌드와 운영

- `npm run build:toss:iap` → `artifacts/chukjalr-fresh-start.ait`.
- 운영 광고 ID가 없으면 광고를 끈다. 테스트 ID를 운영 번들에 사용하지 않는다.
- 운영 광고 그룹은 여전히 구글 반영 중. 운영 ID 발급 후 광고 포함 번들을 다시 생성해야 한다.
- 이 턴 시작 시 현재 출시 버전은 `20260907-1`.
- `20260907-4`는 중간 QA 버전. 구매 안내 보완 전이므로 출시하지 않는다.
- 최종 버전 번호와 검토/출시 상태는 아래 배포 결과에 기록한다.

## 참고 자료

- SDK/서버 주문 확인: https://developers-apps-in-toss.toss.im/documentation/common/monetization/iap/in-app-purchase
- 상품 등록: https://developers-apps-in-toss.toss.im/guide/monetization/in-app-payment
- 거래 기록 보존: https://www.law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=900619372

## 배포 결과 (2026-09-07 15:30 KST)

- 최종 콘솔 버전: **20260907-5**, 상태 **검토 필요**.
- deploymentId: `01a07a8d-9d60-79e4-a85d-d47602013221`.
- 번들 SHA-256: `e8380c2c0ad6353938980795ef60dc7e3ffa95ce466443b6feb08eef0483935d`.
- 콘솔 메모 저장 확인. 20260907-4는 중간 QA/출시 금지로 표시.
- 새 버전 QR 테스트 창을 열어 사용자에게 실기기 실행과 상품 표시 확인 요청.
- **검토 요청 버튼이 비활성**. 공식 출시 가이드상 테스트를 한 번 이상 완료해야 요청 가능.
- 검토 요청·승인·정식 출시는 아직 완료되지 않았다. 현재 서비스 버전은 20260907-1.
- 서버 DB 두 마이그레이션, fresh-start/toss-login 함수 배포는 완료.
- 사용자의 실기기 테스트 결과를 받은 뒤 이 기록의 최종 상태를 갱신한다.

## Review submission update

The user confirmed that version 20260907-5 displays the 1,100 KRW purchase button on their phone. The console then enabled review submission. Release notes were submitted, explicitly distinguishing successful product-display verification from the not-yet-performed completed-purchase E2E test.

Verified console status: review in progress. The console says results will be sent by email within three business days. This supersedes the earlier disabled-button status. Approval and public release are still pending; the public version remains 20260907-1.
