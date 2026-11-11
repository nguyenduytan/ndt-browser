# NDT Browser v0.1 design

Approved scope: a lightweight standalone Node.js library for browser automation,
scraping, click/fill/evaluate and browser-session GET/POST. Both Puppeteer and
Playwright remain native APIs. No CAPTCHA providers, dashboard or crawler platform.

## Decisions

- Node.js >=22.12.0, TypeScript, ESM, npm, one package.
- Launch a real Chrome/Chromium process directly and connect either driver over CDP.
- Discover installed Chrome/Edge or accept executablePath / NDT_BROWSER_PATH. No
  implicit download and no patched Chromium fork. Custom binary arguments are opt-in.
- Headed by default. Headless is explicit. Do not disable the browser sandbox by default.
- Dedicated temporary or persistent profile per local session; exclusive profile lock.
- Remote endpoint connections create a fresh owned context and never close the remote browser.
- Expose typed native browser/context/page; newPage applies NDT settings before returning.
- Native CDP emulation for viewport, locale, timezone, UA/UA metadata. A configurable
  AutomationControlled flag is signal reduction, not full fingerprint protection.
- Optional resource-type blocking reduces transferred bytes; retain normal browser caching.
- request runs fetch in the page's origin, with browser cookies, CORS and proxy routing.
  No silent direct HTTP fallback. No automatic retry of requests or clicks.
- Extraction uses one CSS schema with text/attribute, required, multiple semantics.
- Local library for trusted callers, not an untrusted public URL execution service.
- Release only our new code. Do not copy reference repositories, binaries or profiles.

User-approved additions: bounded Turnstile widget interaction and challenge waiting;
English/Vietnamese documentation with centered header, badges and architecture diagram;
Docker/Compose with non-root Chromium and Xvfb; GitHub topics. The upstream Playwright
seccomp profile is included with its Apache-2.0 license and attribution.

## Acceptance

For each driver, real-browser fixture tests cover navigation, form input/click,
DOM extraction, cookie-authenticated JSON POST, timeout, response byte limits,
resource blocking, persistent profile reuse and remote ownership. Verify the packed
archive in a clean consumer. GitHub CI must pass before tagging a public release.
Fingerprint/bypass performance and third-party runtime compatibility are explicitly
unverified until measured on authorized target sites. v0.1 is not a Chromium patch suite.

## Files

src/config.ts validates public options and locates a browser; src/launcher.ts owns
process/profile lifecycle; src/session.ts bridges native drivers and configures pages;
src/page-tools.ts implements browser fetch/extraction; src/types.ts and src/index.ts
define the public API; src/cli.ts offers a minimal scrape command. test/ uses a local
HTTP fixture and real installed Chromium. examples/ contains runnable SDK usage.
