import { setTimeout as delay } from 'node:timers/promises';
import type { Page } from 'playwright-core';
import { positive } from './config.js';

export interface ChallengeOptions {
  timeout?: number;
  pollInterval?: number;
  settleTime?: number;
  readySelector?: string;
  /** Best-effort native click on a recognized widget only. Disabled by default. */
  clickTurnstile?: boolean;
  maxClicks?: number;
  signal?: AbortSignal;
}
export interface ChallengeResult { status: 'ready'; detected: boolean; clicks: number; elapsedMs: number }
export class ChallengeTimeoutError extends Error {
  readonly code = 'CHALLENGE_TIMEOUT';
  constructor() { super('Challenge did not clear or the ready selector did not appear before timeout'); this.name = 'ChallengeTimeoutError'; }
}

export async function waitForChallenge(
  page: Pick<Page, 'evaluate' | 'mouse' | 'isClosed'>,
  options: ChallengeOptions = {},
  responseChallenged: () => boolean = () => false,
): Promise<ChallengeResult> {
  const timeout = options.timeout ?? 30_000;
  const poll = options.pollInterval ?? 250;
  const settle = options.settleTime ?? 500;
  const maxClicks = options.maxClicks ?? 3;
  positive(timeout, 'timeout'); positive(poll, 'pollInterval'); positive(settle, 'settleTime');
  if (!Number.isInteger(maxClicks) || maxClicks < 0) throw new TypeError('maxClicks must be a nonnegative integer');
  const start = Date.now();
  let readySince = 0, clicks = 0, lastClick = 0, detected = false;
  while (Date.now() - start < timeout) {
    options.signal?.throwIfAborted();
    if (page.isClosed()) throw new Error('Page closed while waiting for challenge');
    try {
      const state = await page.evaluate(selector => {
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
        return { challenged: interstitial || widget && !token, target,
          ready: document.readyState !== 'loading' && (!selector || !!document.querySelector(selector)) };
      }, options.readySelector);
      const challenged = state.challenged || responseChallenged();
      detected ||= challenged;
      if (!challenged && state.ready) {
        readySince ||= Date.now();
        if (Date.now() - readySince >= settle) return { status: 'ready', detected, clicks, elapsedMs: Date.now() - start };
      } else readySince = 0;
      if (challenged && options.clickTurnstile && state.target && clicks < maxClicks && Date.now() - lastClick >= 1500) {
        options.signal?.throwIfAborted();
        await page.mouse.click(state.target.x, state.target.y);
        clicks++; lastClick = Date.now();
      }
    } catch (error) {
      // Navigation replaces the execution context while an interstitial redirects.
      if (!(error instanceof Error) || !/execution context.*destroyed|cannot find context/i.test(error.message)) throw error;
      readySince = 0;
    }
    await delay(Math.min(poll, Math.max(1, timeout - (Date.now() - start))), undefined, { signal: options.signal });
  }
  throw new ChallengeTimeoutError();
}
