# 응원 프로필 팩 — 월 2,200원

Status: implementation and local tests completed; NOT deployed or available for purchase.

Product: 응원 프로필 팩 월간 구독. Monthly auto-renewal, KRW 2,200 including VAT (console supply price 2,000). Custom team-name/color badge and avatar ring in chat, profile and ranking. Team changes included. No licensed club crest or paid competitive advantage. No trial/introductory discount.

Console registration form in workspace 5291 / chukjalr has name, description, monthly cycle, supply price 2,000, minimum existing bundle 20260907-5, visibility OFF. It has NOT been submitted: image upload was rejected by Chrome's file-access permission. Attach public/supporter/membership.png (1024 square), review and save hidden. Do not create duplicate products if registration is completed manually. SKU has not been issued/configured.

## Activation work remaining

- Finish hidden product registration and record SKU. Set matching TOSS_SUPPORTER_SKU server secret and VITE_TOSS_SUPPORTER_SKU at build time. The client validates SUBSCRIPTION / MONTHLY / display price 2,200 before enabling purchase.
- Apply migrations 20260907000034 and 20260907000035 to production, deploy supporter and supporter-webhook functions. Neither has been deployed by this change.
- Register authenticated subscription callback URL ending /functions/v1/supporter-webhook and set TOSS_SUPPORTER_WEBHOOK_BASIC to the exact configured Basic value. Preserve other existing IAP callback settings. The authenticated registration verification event returns 200.
- Confirm the provider timezone for timezone-less occurredAt/expiresAt timestamps, then set TOSS_SUBSCRIPTION_TIME_OFFSET (for example +09:00 only after confirmation). Official subscription docs explicitly use timezone-less strings but do not specify the timezone. Unconfigured local timestamps are deliberately rejected, never parsed in the machine timezone. Verify renewal callbacks refer to the mapped order identifier; test real provider lifecycle before exposing purchases.
- Verify the actual subscription cancellation path for this mini-app/payment platform and finalize copy. Current UI refers to the purchasing store's subscription management; this is not yet verified in a real purchase.
- Test purchase, pending grant recovery, renewal, cancellation, expiration and refund in a supported Toss app. Subscription sandbox is not supported by current official guide. No real-money purchase was made.
- Build/upload updated Toss app, set minimum product bundle to that release, complete review and enable product only after above checks pass.

## Architecture

Only the Basic-authenticated webhook updates access state. The authenticated grant endpoint verifies order ID/SKU/payment using mTLS and x-toss-user-key derived from trusted server metadata, then binds the order to the authenticated account. Client claims cannot grant access. Webhook-before-grant is supported; old notifications cannot replace newer state. The client acknowledges payment only after server access is active and no grant is pending.

Payment tables are inaccessible to anon/authenticated roles. Public-to-signed-in badge RPC exposes only team and expiry, max 100 users. Expiration is checked server-side on reads and client-side for mounted badge/ring removal. Renewal cancellation retains the remaining period; revoked/expired/paused/on-hold statuses cannot grant access.

## Validation

- npm test: 39 tests passed (six subscription tests).
- npm run build: passed.
- Migration and tests/sql/supporter.sql passed on local PostgreSQL WASM (PGlite) with minimal profiles/teams fixtures and anon/authenticated/service_role roles. Covers ownership, webhook-before-grant, out-of-order events, cancellation, revocation, elapsed expiry and privilege checks. Does not substitute for integration with the production Supabase schema or actual provider callbacks.
- Product icon rendered and visually inspected, 1024×1024.

References: https://developers-apps-in-toss.toss.im/bedrock/reference/framework/인앱%20결제/subscription.html and https://www.api-football.com/terms .

Local browser QA: profile card renders and selecting Tottenham updates the custom badge preview; purchase remains disabled with no SKU. Transaction tombstones survive account deletion and cannot be rebound; daily cleanup migration 35 follows the existing pg_cron retention pattern (schedule not executed in the local minimal PGlite harness).
