# 축잘알 iOS 1.1 — 웹·앱인토스 동기화

Updated 2026-09-11. App Store app 6808257765, bundle `com.jalr.chukjalal`.

## Implemented

- Shared Matchday design tokens, canonical web wordmark assets and app icon in native app and Live Activity widget.
- Updated login/onboarding/home/match details/ranking/profile/purchase screens. Major vs other competitions, editable league order, league notification preferences, and settlement recap.
- Profile tabs: 기록 / 응원·도전 / 설정. League accuracy shows the eight major competitions only.
- StoreKit 2 fresh-start consumable and monthly supporter subscription; account-bound server verification, idempotent fulfillment, recovery, renewals, cancellation, expiry and refund handling. No purchase changes official rating, ranking or XP.
- Apple signed transaction and server notification verification via official Apple server library with production/sandbox validation, trusted roots and online checks. Apple IAP credentials are now configured and the deployed authenticated status returns storeReady=true.
- Fixed Supabase Edge's incomplete X509 implementation and legacy EC curve names using a narrow Node compatibility adapter. Apple SDK certificate-chain, required OID, validity, JWS and online OCSP checks remain enabled. Both apple-notifications and apple-iap were redeployed sequentially with this fix.
- Server migrations 20260911000043 and 44 applied. apple-iap, apple-notifications and revised fresh-start functions deployed sequentially.
- Privacy manifest and legal pages aligned with actual authentication, chat, gameplay, profile, push-token and purchase data. No tracking.

## App Store Connect preparation

- iOS 1.1 created. Korean description, promotional text, keywords, release notes and review instructions saved.
- Builds 6, 7 and 8 uploaded successfully. Build 8 includes the final privacy-manifest corrections and is selected and saved for iOS 1.1 in App Store Connect.
- New 6.9-inch actual simulator screenshots uploaded; home first, then ranking and profile. Old 6.5-inch screenshots replaced with automatic use of new 6.9-inch images.
- `com.jalr.chukjalal.freshstart`: 새 출발권 1회, consumable, Apple ID 6810977267, KRW 1,100. Korean localization and review notes prepared.
- `com.jalr.chukjalal.supporter.monthly`: 응원 프로필 팩 월간, 1 month, Apple ID 6810979600, KRW 2,200. Group 22376075. Product and group Korean localization saved. Family sharing and billing grace period remain off.
- Product review screenshots, product association and review submission remain to be completed after the live purchase setup is ready.
- Current iOS submission draft contains iOS 1.1 (8) and the supporter subscription group (2 items). The separate unassigned group draft was removed by removing its only draft item, and the group was added to the iOS draft. No review submission has been sent. Both purchase products require review screenshots before they can be added; Connect explicitly reports this missing field. Replace waiting-state purchase screens with ready/purchase-tested screenshots before final submission.
- Store privacy questionnaire corrected and published for all eight data types: name, email address, messages, photos/videos, gameplay, user ID, device ID and purchases. All use App Functionality, are linked to the user and are not used for tracking. No incomplete data-type notice remains.
- Production and Sandbox server URLs saved to the deployed apple-notifications endpoint. Both received genuine Apple-signed V2 TEST notifications successfully; Apple Server API reports SUCCESS for both deliveries.
- Streamlined Purchasing remains at its default. Turning it off requires an already approved PurchaseIntent-capable binary. No contingent-price, win-back, promo/offer codes or promoted product were enabled; don't enable external first purchases without the corresponding app-account binding flow.

## External requirements

- User's “진행해” approved the prepared seller-information confirmation, Paid Apps Agreement acceptance, IAP key creation and server connection. Those actions are completed; do not ask again or create another key.
- Paid Apps Agreement was accepted for 2026-09-11–2027-09-03. Its current status is “사용자 정보 대기 중” (Pending User Info), so it is not yet active.
- User must complete Bank Accounts, Korea Tax Form, and US Tax Questionnaire in Business. No bank or tax information has been entered or inferred by the agent. An asynchronous user-input request is pending.
- The Korea compliance banner also requires a business contact email and whether the developer has a valid Korean business registration number. The form was inspected and canceled without entering or submitting any information. User must confirm their actual status.
- `Chukjalal Server IAP` In-App Purchase key was created and its one-time download backed up outside the repository with restrictive file permissions. APPLE_IAP_PRIVATE_KEY, APPLE_IAP_KEY_ID and APPLE_IAP_ISSUER_ID are configured in Supabase. Never record secret values in git or logs.
- Configured production AND sandbox App Store Server Notifications URL: https://nqkytgbbvlemeoljibmf.supabase.co/functions/v1/apple-notifications
- Genuine signed server-notification tests now pass in Sandbox and Production. A genuine Sandbox product purchase remains pending: StoreKit still displays the product-preparation state while the paid agreement is inactive. Capture ready-state review screenshots, associate both products with the existing iOS review draft, test purchases, then submit the draft.
- Apple explicitly requires an Active Paid Apps Agreement, including banking/tax information, for Sandbox IAP testing: https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/overview-for-configuring-in-app-purchases and https://developer.apple.com/documentation/technotes/tn3186-troubleshooting-in-app-purchases-availability-in-the-sandbox
- Do NOT report live release or review submission until App Store Connect confirms it.

## Validation completed

- Web tests: 69/69 passed.
- iOS baseline, settlement recap, competition checks passed; 55 competitions, 1045 teams, 1586 fixtures in catalog validation.
- Native simulator builds and device archive/export/upload passed.
- PGlite Apple purchase SQL scenarios passed: duplicate delivery/use, ownership, refund before/after use, stale events, sandbox/production namespaces, subscription renewal/cancellation/expiry, old-period refunds, detached-account tombstones and client access denial.
- Deno type checks and signature-rejection tests passed.
- New certificate/crypto regression tests passed on Deno 2.1.4 and 2.9.6 (5 tests on each): DER/PEM round-trip, correct/wrong issuer, tampered certificate, EC aliases, unknown curves, JWT signatures, wrong-curve rejection, forged Apple messages, and invalid products.
- On Deno 2.1.4, the actual shared Apple client signed API requests accepted by Apple in both environments, and the shared verifier accepted actual signed TEST messages with online checks.
- Deployed notification replays returned HTTP 200 for genuine Apple TEST messages in both environments. Fresh requests then confirmed end-to-end Apple delivery SUCCESS for Sandbox and Production. No transaction or entitlement was created by TEST messages.
- Deployed API authenticated smoke checks passed for status, entitlement denial, forged JWS, RPC privileges and forged server notifications. No real paid purchase was made.
- Native app icon and both wordmark PNGs match web assets byte for byte; 46 shared color tokens verified.

## Artifacts and logs

- `ios/build/release-1.1-7/` and `ios/build/release-1.1-8/`: archives, exports and upload logs.
- `/tmp/chuk-ios-1.1-7-release.log`, `/tmp/chuk-ios-1.1-8-release.log`.
- `apple-validation.json`: non-sensitive Apple TEST delivery evidence. `/tmp/chuk-apple-compat-tests.log` and `/tmp/chuk-apple-live-tests.log`: compatibility and deployed authorization checks.
- `docs/releases/ios-1.1/screenshots/`: actual iPhone 17 Pro Max 1320 × 2868 screenshots.
- Landing + legal updates committed as fcddbb7 and b65650b, pushed to main. GitHub Pages runs 34575061652 and 34575691856 both succeeded. All nine published landing/legal/brand/screenshot files returned HTTP 200 and match the local bytes.
- Apple data-type reference: https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatype
