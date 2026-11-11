import { connect, type BrowserOptions } from '../dist/index.js';

async function nativeTypes() {
  const puppeteer = await connect();
  await puppeteer.page.type('#name', 'NDT');
  // @ts-expect-error Playwright's getByRole is not a Puppeteer API.
  puppeteer.page.getByRole('button');
  await puppeteer.close();
  const playwright = await connect({ driver: 'playwright' });
  await playwright.page.getByRole('button').click();
  // @ts-expect-error Puppeteer's createCDPSession is not a Playwright Page API.
  playwright.page.createCDPSession();
  await playwright.close();
  const config: BrowserOptions = { driver: Math.random() > 0.5 ? 'puppeteer' : 'playwright' };
  const either = await connect(config);
  await either.page.goto('https://example.com');
  await either.close();
}
void nativeTypes;
