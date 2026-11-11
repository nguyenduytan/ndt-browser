import { bounded } from './deadline.js';
import { setTimeout as delay } from 'node:timers/promises';
import type { Page } from 'playwright-core';
import { positive } from './config.js';

export interface ChallengeOptions {
  onState?: (state: 'checking' | 'challenge' | 'ready' | 'timeout') => void;
  timeout?: number;
  pollInterval?: number;
  settleTime?: number;
  readySelector?: string;
  /** Exact final URL required in addition to challenge clearance. */
  readyUrl?: string;
  /** Session helper only: optional PNG captured on challenge timeout. */
  screenshotOnTimeout?: string;
  /** Best-effort native click on a recognized widget only. Disabled by default. */
  clickTurnstile?: boolean;
  maxClicks?: number;
  signal?: AbortSignal;
}
export interface ChallengeResult { status: 'ready'; detected: boolean; clicks: number; elapsedMs: number }
export interface ChallengeDiagnostics {
  url?: string;
  elapsedMs: number;
  detected: boolean;
  clicks: number;
  reason: 'challenge' | 'readiness' | 'page-unresponsive';
  screenshotPath?: string;
  screenshotError?: string;
}
export class ChallengeTimeoutError extends Error {
  readonly code = 'CHALLENGE_TIMEOUT';
  diagnostics?: ChallengeDiagnostics;
  constructor() { super('Challenge did not clear or the ready selector did not appear before timeout'); this.name = 'ChallengeTimeoutError'; }
}

export async function waitForChallenge(
  page: Pick<Page, 'evaluate' | 'mouse' | 'isClosed'> & { url?: () => string },
  options: ChallengeOptions = {},
  responseChallenged: () => boolean = () => false,
): Promise<ChallengeResult> {
  const timeout = options.timeout ?? 30_000;
  const poll = options.pollInterval ?? 250;
  const settle = options.settleTime ?? 500;
  const maxClicks = options.maxClicks ?? 3;
  positive(timeout, 'timeout'); positive(poll, 'pollInterval'); positive(settle, 'settleTime');
  if (!Number.isInteger(maxClicks) || maxClicks < 0) throw new TypeError('maxClicks must be a nonnegative integer');
  options.signal?.throwIfAborted();
  const start = Date.now();
  let lastState = '';
  const notify = (state: 'checking' | 'challenge' | 'ready' | 'timeout') => {
    if (state !== lastState) { lastState = state; options.onState?.(state); }
  };
  notify('checking');
  let readySince = 0, clicks = 0, lastClick = 0, detected = false;
  let reason: ChallengeDiagnostics['reason'] = 'readiness';
  const timedOut = (error = new ChallengeTimeoutError()) => {
    error.diagnostics = { url: page.url?.(), elapsedMs: Date.now() - start, detected, clicks, reason };
    notify('timeout');
    return error;
  };
  while (Date.now() - start < timeout) {
    options.signal?.throwIfAborted();
    if (page.isClosed()) throw new Error('Page closed while waiting for challenge');
    try {
      reason = 'page-unresponsive';
      const state = await bounded(page.evaluate(selector => {
        const fields = [...document.querySelectorAll<HTMLInputElement>('input[name="cf-turnstile-response"]')];
        const token = fields.length > 0 && fields.every(field => !!field.value);
        const frames = [...document.querySelectorAll<HTMLIFrameElement>('iframe')].filter(frame => {
          try { return new URL(frame.src).hostname === 'challenges.cloudflare.com'; } catch { return false; }
        });
        const widgets = [...document.querySelectorAll('.cf-turnstile[data-sitekey]')];
        const interstitial = /^(just a moment|checking your browser|attention required)/i.test(document.title) ||
          !!document.querySelector('#challenge-running, #challenge-stage');
        const widget = fields.length > 0 || frames.length > 0 || widgets.length > 0;
        let target: { x: number; y: number } | null = null;
        // shortcut: standard visible Turnstile geometry only; use native APIs for custom layouts.
        for (const element of [...frames, ...widgets]) {
          const box = element.getBoundingClientRect();
          if (box.width >= 100 && box.width <= 600 && box.height >= 40 && box.height <= 200 &&
              box.x >= 0 && box.y >= 0 && box.right <= innerWidth && box.bottom <= innerHeight) {
            const hit = document.elementFromPoint(box.x + 28, box.y + box.height / 2);
            if (hit && (hit === element || element.contains(hit))) {
              target = { x: box.x + 28, y: box.y + box.height / 2 }; break;
            }
          }
        }
        const readyElement = selector ? document.querySelector(selector) : null;
        const visible = !selector || !!readyElement && readyElement.getClientRects().length > 0 &&
          getComputedStyle(readyElement).visibility !== 'hidden' && getComputedStyle(readyElement).opacity !== '0';
        return { challenged: interstitial || widget && !token, target,
          ready: document.readyState !== 'loading' && visible };
      }, options.readySelector), timeout - (Date.now() - start), options.signal, new ChallengeTimeoutError());
      const challenged = state.challenged || responseChallenged();
      reason = challenged ? 'challenge' : 'readiness';
      detected ||= challenged;
      notify(challenged ? 'challenge' : 'checking');
      if (!challenged && state.ready && (!options.readyUrl || page.url?.() === options.readyUrl)) {
        readySince ||= Date.now();
        if (Date.now() - readySince >= settle) { notify('ready'); return { status: 'ready', detected, clicks, elapsedMs: Date.now() - start }; }
      } else readySince = 0;
      if (challenged && options.clickTurnstile && state.target && clicks < maxClicks && Date.now() - lastClick >= 1500) {
        options.signal?.throwIfAborted();
        await bounded(page.mouse.click(state.target.x, state.target.y), timeout - (Date.now() - start), options.signal, new ChallengeTimeoutError());
        clicks++; lastClick = Date.now();
      }
    } catch (error) {
      if (error instanceof ChallengeTimeoutError) throw timedOut(error);
      // Navigation replaces the execution context while an interstitial redirects.
      if (!(error instanceof Error) || !/execution context.*destroyed|cannot find context/i.test(error.message)) throw error;
      readySince = 0;
    }
    await delay(Math.min(poll, Math.max(1, timeout - (Date.now() - start))), undefined, { signal: options.signal });
  }
  throw timedOut();
}
