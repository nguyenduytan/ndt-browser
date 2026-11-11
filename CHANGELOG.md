# Changelog

## 0.3.0 — 2026-11-11

- Automatic setup for popups/native pages within the owned session context.
- CDP connection headers for authenticated HTTP discovery and WebSocket transport.
- Exact final-URL readiness, structured challenge timeout diagnostics and optional PNG capture.
- Explicit `recoverPage()` closes a stuck page and replaces the default page when applicable.
- Bounded browser/context shutdown and host-side API request deadlines.
- Both-driver regression coverage for popup setup, iframe actions, hung renderers and authenticated CDP isolation.

Popup discovery cannot configure the first request retroactively. Recovery discards the affected page's unsaved state and never retries a request. Screenshots are best effort with a two-second capture limit.

## 0.2.0 — 2026-11-11

- Proxy URL credentials, shared navigation/readiness deadline and visible ready selectors.
- Challenge state callbacks and explicit click/type/scroll pacing helpers.
- Cancellation and bounded waiting for challenge operations.

`session.goto()` combines navigation and visible readiness under one deadline.
`onState` reports `checking`, `challenge`, `ready`, and `timeout`.
With `humanize: true`, session helpers use a 70 ms click hold, a 60 ms typing
interval, and up to 20 scroll steps. Native driver methods remain unchanged;
these helpers do not simulate randomized mouse paths. Proxy URL credentials
are percent-decoded and removed from the browser launch endpoint.

## 0.1.0 — 2026-11-11

- Direct Chrome/Chromium launch with Puppeteer or Playwright over CDP.
- Native browser/context/page APIs for complete browser automation.
- Temporary and persistent profiles, remote context isolation and cleanup.
- Browser-session GET/POST, JSON bodies, timeout and response-size limits.
- CSS extraction, text/attribute fields and required/multiple semantics.
- Native locale, timezone, viewport, user agent and UA metadata controls.
- Optional automation-signal flag and custom Chromium executable/arguments.
- HTTP proxy authentication, optional resource blocking and transfer counters.
- JSON CLI, examples, TypeScript declarations and real-browser fixture tests.
- Challenge detection/wait, AbortSignal cancellation and bounded opt-in widget clicks.
- English/Vietnamese documentation, Docker runtime/test images and Compose profiles.

No Chromium fingerprint patches, CAPTCHA solver or verified Cloudflare bypass claim.
