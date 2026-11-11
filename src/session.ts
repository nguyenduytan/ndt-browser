import type { Browser as PWBrowser, BrowserContext as PWContext, CDPSession } from 'playwright-core';
import type { Browser as PPBrowser } from 'puppeteer-core';
import type { BrowserOptions, Driver, DriverTypes, ExtractionSchema, NetworkStats, RequestOptions } from './types.js';
import type { LaunchedBrowser } from './launcher.js';
import { extract, request, type EvaluationPage } from './page-tools.js';
import { waitForChallenge, type ChallengeOptions } from './challenge.js';

export class BrowserSession<D extends Driver> {
  readonly stats: NetworkStats = { requests: 0, blocked: 0, transferredBytes: 0 };
  page!: DriverTypes[D]['page'];
  private closing?: Promise<void>;
  private configured = new WeakMap<object, Promise<void>>();
  private challenged = new WeakMap<object, boolean>();
  readonly profilePath?: string;

  constructor(
    readonly driver: D,
    readonly browser: DriverTypes[D]['browser'],
    readonly context: DriverTypes[D]['context'],
    readonly endpoint: string,
    private readonly options: BrowserOptions,
    private readonly launched?: LaunchedBrowser,
  ) { this.profilePath = launched?.profilePath; }

  private ensureOpen(): void { if (this.closing) throw new Error('Browser session is closed'); }

  async newPage(): Promise<DriverTypes[D]['page']> {
    this.ensureOpen();
    const page = await this.context.newPage() as DriverTypes[D]['page'];
    try { await this.configurePage(page); return page; }
    catch (error) { await page.close(); throw error; }
  }

  /** Apply settings to a page created through native APIs; call before navigating. */
  configurePage(page: DriverTypes[D]['page']): Promise<void> {
    this.ensureOpen();
    let configured = this.configured.get(page);
    if (!configured) { configured = this.setupPage(page); this.configured.set(page, configured); }
    return configured;
  }

  private async setupPage(page: DriverTypes[D]['page']): Promise<void> {
    const context = this.driver === 'puppeteer' ? (page as DriverTypes['puppeteer']['page']).browserContext() :
      (page as DriverTypes['playwright']['page']).context();
    if (context !== this.context) throw new Error('Page must belong to this session context');
    const timeout = this.options.timeout ?? 30_000;
    page.setDefaultTimeout(timeout); page.setDefaultNavigationTimeout(timeout);
    const cdp = (this.driver === 'puppeteer' ?
      await (page as DriverTypes['puppeteer']['page']).createCDPSession() :
      await (this.context as PWContext).newCDPSession(page as DriverTypes['playwright']['page'])) as unknown as CDPSession;
    await cdp.send('Network.enable');
    const { frameTree } = await cdp.send('Page.getFrameTree');
    cdp.on('Network.responseReceived', event => {
      if (event.type === 'Document' && event.frameId === frameTree.frame.id)
        this.challenged.set(page, Object.entries(event.response.headers).some(([name, value]) =>
          name.toLowerCase() === 'cf-mitigated' && value === 'challenge'));
    });
    cdp.on('Network.requestWillBeSent', () => { this.stats.requests++; });
    cdp.on('Network.loadingFinished', event => { this.stats.transferredBytes += event.encodedDataLength ?? 0; });
    if (this.options.headers) await cdp.send('Network.setExtraHTTPHeaders', { headers: this.options.headers });
    const fp = this.options.fingerprint;
    if (fp?.viewport) await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: fp.viewport.width, height: fp.viewport.height,
      deviceScaleFactor: fp.viewport.deviceScaleFactor ?? 1, mobile: fp.viewport.isMobile ?? false,
    });
    if (fp?.timezone) await cdp.send('Emulation.setTimezoneOverride', { timezoneId: fp.timezone });
    if (fp?.locale) await cdp.send('Emulation.setLocaleOverride', { locale: fp.locale });
    if (fp?.userAgent || fp?.locale) {
      const version = await cdp.send('Browser.getVersion');
      await cdp.send('Network.setUserAgentOverride', {
        userAgent: fp.userAgent ?? version.userAgent, acceptLanguage: fp.locale,
        userAgentMetadata: fp.userAgentMetadata,
      });
    }
    const blocked = new Set<string>(this.options.blockResources ?? []);
    const auth = this.options.proxy?.username !== undefined ? this.options.proxy : undefined;
    if (blocked.size || auth) {
      const attemptedAuth = new Set<string>();
      cdp.on('Fetch.authRequired', event => {
        const provide = auth && event.authChallenge.source === 'Proxy' && !attemptedAuth.has(event.requestId);
        attemptedAuth.add(event.requestId);
        void cdp.send('Fetch.continueWithAuth', { requestId: event.requestId,
          authChallengeResponse: provide ? { response: 'ProvideCredentials', username: auth.username, password: auth.password } :
            { response: event.authChallenge.source === 'Proxy' ? 'CancelAuth' : 'Default' },
        }).catch(() => {}); // A page may close while an interception is in flight.
      });
      cdp.on('Fetch.requestPaused', event => {
        if (blocked.has(event.resourceType.toLowerCase())) {
          this.stats.blocked++;
          void cdp.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' }).catch(() => {});
        } else void cdp.send('Fetch.continueRequest', { requestId: event.requestId }).catch(() => {});
      });
      const resourceTypes = { image: 'Image', media: 'Media', font: 'Font', stylesheet: 'Stylesheet' } as const;
      await cdp.send('Fetch.enable', { handleAuthRequests: !!auth, patterns: auth ? [{ urlPattern: '*' }] :
        (this.options.blockResources ?? []).map(type => ({ resourceType: resourceTypes[type], urlPattern: '*' })) });
    }
  }

  request(url: string, options: RequestOptions = {}, page: DriverTypes[D]['page'] = this.page) {
    this.ensureOpen();
    return request(page as EvaluationPage, url, { timeout: this.options.timeout, ...options });
  }

  extract(schema: ExtractionSchema, page: DriverTypes[D]['page'] = this.page) {
    this.ensureOpen();
    return extract(page as EvaluationPage, schema);
  }

  waitForChallenge(options: ChallengeOptions = {}, page: DriverTypes[D]['page'] = this.page) {
    this.ensureOpen();
    return waitForChallenge(page as DriverTypes['playwright']['page'], options, () => this.challenged.get(page) ?? false);
  }

  close(): Promise<void> {
    return this.closing ??= (async () => {
      try {
        if (!this.launched) {
          try { await this.context.close(); }
          finally {
            if (this.driver === 'puppeteer') await (this.browser as PPBrowser).disconnect();
            else await this.browser.close(); // Playwright CDP close disconnects the borrowed browser.
          }
        } else {
          if (this.driver === 'playwright' && (this.browser as PWBrowser).isConnected()) {
            const cdp = await (this.browser as PWBrowser).newBrowserCDPSession();
            await cdp.send('Browser.close').catch(() => {});
          }
          await this.browser.close();
        }
      } finally { await this.launched?.stop(); }
    })();
  }

  async [Symbol.asyncDispose](): Promise<void> { await this.close(); }
}
