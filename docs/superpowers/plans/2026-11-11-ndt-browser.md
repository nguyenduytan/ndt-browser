# NDT Browser Implementation Plan

> Execution: inline in the existing task, following executing-plans and Ponytail.

**Goal:** Ship a small, installable dual-driver browser automation library.

**Architecture:** Direct Chromium launch with CDP connections. Native driver objects
remain accessible; shared helpers handle profiles, page configuration, fetch and extraction.

**Tech Stack:** Node.js >=22.12.0, TypeScript, playwright-core, puppeteer-core, node:test.

**Spec:** ../specs/2026-11-11-ndt-browser-design.md

## Global constraints

- One ESM npm package; no implicit browser download, CAPTCHA provider or Chromium fork.
- New project only; no changes to downloaded reference code.
- Never close a borrowed remote browser. Never retry POST automatically.
- Browser fetch preserves CORS, cookies and proxy route; no hidden direct-network fallback.

## 1. Configuration and launch

- [x] Add tests for unsupported drivers, unsafe launch argument conflicts, invalid
  profile/proxy settings and invalid timeouts. `assert.throws(() => validateOptions({driver:'other'}))`.
- [x] Run `npm run test:unit`, observe missing behavior, implement src/config.ts and types.ts.
- [x] Test dedicated-profile locking and release with actual browser launch in launcher.ts.
- [x] Implement browser discovery, temporary directory cleanup and bounded startup wait.

## 2. Dual-driver sessions

- [x] Add the same local fixture contract for `connect({driver:'puppeteer'})` and
  `connect({driver:'playwright'})`: navigation, native click/fill, extraction, newPage settings.
- [x] Implement session.ts and index.ts; use native typed Page/Browser/Context objects.
- [x] Verify native locale/timezone/viewport, resource blocking, persistent cookie reuse.
- [x] Verify remote close leaves existing page/browser alive, including setup failure.

## 3. Browser requests and extraction

- [x] Test cookie-authenticated POST returns `{method:'POST', body:{name:'NDT'}}` once.
- [x] Test request timeout, response size cap, missing required selector and invalid URL/body.
- [x] Implement page-tools.ts using page.evaluate, AbortController and bounded response reads.
- [x] Expose text/json response access, CSS text/attribute extraction and page selection.

## 4. Package and release

- [x] Implement minimal CLI and examples for each driver and API POST.
- [x] Document runtime choices, fingerprint limits, native API hooks, CORS and routing.
- [x] Build, run real browser tests, audit production dependencies, npm pack and clean install.
- [x] Initialize Git, commit, create GitHub repository, push and wait for CI.
- [x] Tag v0.1.0 and create GitHub release with npm-installable tarball and SHA256 checksum.

GitHub release is the installation channel for v0.1; npm registry publishing is optional
and requires separate npm authentication. User has authorized Git push and release.

Validation: 21 tests passed locally and on Windows/Linux/macOS/Docker CI run 42981580746. Docker headed/Xvfb passed for both drivers. Archive installed in a clean consumer. Release: https://github.com/nguyenduytan/ndt-browser/releases/tag/v0.1.0
