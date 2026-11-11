import { validateOptions } from './config.js';
import { launch } from './launcher.js';
import { BrowserSession } from './session.js';
import type { BrowserOptions, Driver } from './types.js';
export { BrowserSession } from './session.js';
export type * from './types.js';
export { ChallengeTimeoutError } from './challenge.js';
export type { ChallengeOptions, ChallengeResult } from './challenge.js';

export function connect(options?: BrowserOptions<'puppeteer'>): Promise<BrowserSession<'puppeteer'>>;
export function connect(options: BrowserOptions<'playwright'> & { driver: 'playwright' }): Promise<BrowserSession<'playwright'>>;
export function connect(options: BrowserOptions): Promise<BrowserSession<Driver>>;
export async function connect(options: BrowserOptions = {}): Promise<BrowserSession<Driver>> {
  validateOptions(options);
  const launched = options.endpoint ? undefined : await launch(options);
  const endpoint = options.endpoint ?? launched!.endpoint;
  const timeout = options.timeout ?? 30_000;
  let session: BrowserSession<Driver> | undefined;
  let disconnect: (() => Promise<void>) | undefined;
  try {
    if (options.driver === 'playwright') {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.connectOverCDP(endpoint, { timeout });
      disconnect = () => browser.close();
      const context = launched ? browser.contexts()[0]! : await browser.newContext({ viewport: null });
      session = new BrowserSession('playwright', browser, context, endpoint, options, launched);
    } else {
      const { default: puppeteer } = await import('puppeteer-core');
      const browser = await puppeteer.connect({
        ...(/^https?:/.test(endpoint) ? { browserURL: endpoint } : { browserWSEndpoint: endpoint }),
        defaultViewport: null, protocolTimeout: timeout,
      });
      disconnect = async () => { await browser.disconnect(); };
      const context = launched ? browser.defaultBrowserContext() : await browser.createBrowserContext();
      session = new BrowserSession('puppeteer', browser, context, endpoint, options, launched);
    }
    session.page = await session.newPage();
    return session;
  } catch (error) {
    if (session) await session.close();
    else { try { await disconnect?.(); } finally { await launched?.stop(); } }
    throw error;
  }
}
