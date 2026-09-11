# 2026-09-08 앱인토스 푸시와 iOS 아이콘

## 구현 및 서버 배포 완료
- 내 기록에 토스 알림 설정: 예측 마감 15분 전, 예측한 경기 시작 10분 전, 응원 팀 채팅 개방(경기 1시간 전), 예측 정산 결과.
- 기본값 모두 꺼짐. `Notification.requestAgreement` 성공 후 종류별 설정 저장. 사용자는 앱에서 종류별 해제, 토스 설정에서 수신 철회 가능. 토스 API도 실제 동의를 독립적으로 검증.
- migration 20260908000038 및 `toss-notifications`, `toss-notifications-send` 배포 완료. 1분 주기 크론.
- 미승인/비토스 계정/미동의 설정/취소 경기/활성화 전 과거 이벤트 제외. 경기별 유일 발송 기록을 원자적으로 확보해 중복 실행 방지. 시간초과 등 전송 여부가 불명확한 응답은 자동 재발송하지 않음.
- 일반 클라이언트는 발송 RPC, 템플릿 및 발송 기록에 직접 접근 불가. API는 인증된 본인 설정만 처리. 워커와 테스트 발송은 서버 SYNC_TOKEN 필수.
- 토스 `SUCCESS`라도 `sentPushCount=0` 또는 채널별 실패가 있으면 전송 완료로 기록하지 않음.
- 알림 링크는 종류별 경로를 열며 해당 사용자의 가장 최근 성공 발송 경기로 이동. 결과 알림의 기본 목적지는 내 기록.
- iOS 원본 `ios/Resources/Assets.xcassets/AppIcon.appiconset/icon-1024.png`를 `public/app-icon.png`로 복사. favicon/apple-touch-icon 적용. 콘솔용 600px 파일: `artifacts/app-icon-toss-600.png`.
- 개인정보 처리방침에 알림 설정·발송 기록 및 토스 알림 전송 반영.

## 콘솔 완료
워크스페이스 5291 / chukjalr. 동의문: 축잘알 경기·예측 알림.
4개 기능성 캠페인 모두 콘솔에서 **승인됨** 확인 후 서버 approved=true 적용.

| 종류 | 코드 | 캠페인 번호 |
|---|---|---|
| 결과 | chukjalr-prediction-result | 11963 |
| 마감 | chukjalr-prediction-lock | 11965 |
| 시작 | chukjalr-kickoff | 11967 |
| 채팅 | chukjalr-chat-open | 11969 |

## 검증
- npm test 42/42 통과.
- PGlite SQL 검증 통과: 4가지 발송 조건, 승인/토스 계정 제한, 중복 방지, opt-out, 활성화 전 과거 알림 제외, VOID 경기 제외, 클라이언트 권한 차단.
  - `PGLITE_MODULE=/tmp/chukjalal-supporter-sql-check/node_modules/@electric-sql/pglite/dist/index.js node scripts/verify-notification-sql.mjs`
- `node scripts/verify-notifications.mjs` 운영 API 검증 통과: 미인증 거부, 기본 꺼짐, 종류별 켜기/끄기, 잘못된 입력, 발송 권한 차단. 임시 미온보딩 계정 삭제. 이 테스트는 실제 메시지 발송 없음.
- 실제 크론 경로 HTTP 200, `{ok:true,sent:0,failed:0,unknown:0,skipped:0}` 확인(request 10266). 수신 신청자가 없으므로 발송 0은 정상.
- UI 로컬 검증: 네 가지 스위치 표시, 끄기 저장, 토스 미지원 환경에서 허위 활성화 없이 안내 표시.
- 사용자 지정 `축잘알97b282` 계정에 결과 알림 테스트 API 호출: HTTP200 / resultType SUCCESS지만 **sentPushCount=0, TERMS_DISAGREED_MEMBER**. 실제 도착 성공 아님. 수신 동의 필요.

## 번들 및 남은 단계
- 버전 **20260908-7** 콘솔 업로드/등록 완료, 검토 요청 제출 완료, 콘솔 **검토 중** 확인. 안내: 영업일 3일 내 이메일 통보.
- deploymentId: `01a07ec8-377a-7579-83a0-e8d63050642d`
- SHA256: `4a2de0e57cb9d79ed154edb48c80e3619b7c621336e704146b9198cbd3b277ac`
- 박진서 계정으로 콘솔의 새 버전 테스트 링크 푸시 요청.
- 사용자 휴대전화에서 새 버전 실행 및 내 기록 > 알림 수신 동의 필요. 이후 실제 메시지 도착 테스트 진행. 번들 검토 요청은 별도로 제출함.
- 현재 확인된 라이브 버전은 **20260907-6** (2026-09-07 22:21 출시). 새 푸시 버전은 아직 라이브가 아님.
- 콘솔 앱 아이콘 교체 파일 업로드 후 **임시저장 완료**. 최종 검토 요청은 책임/손해보상 조항 재동의가 있어 사용자 승인 질문 대기 중. 다른 메타 정보/스크린샷/카테고리 유지.
