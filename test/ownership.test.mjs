import test from 'node:test';
import assert from 'node:assert/strict';
import { connect } from '../dist/index.js';

for (const driver of ['puppeteer', 'playwright']) {
  test(`${driver}: setup failure disposes remote context without closing owner`, { timeout: 30_000 }, async t => {
    const owner = await connect({ headless: true });
    t.after(() => owner.close());
    const before = owner.browser.browserContexts().length;
    await assert.rejects(connect({ driver, endpoint: owner.endpoint,
      fingerprint: { userAgent: 'test', userAgentMetadata: {} } }));
    assert.equal(owner.browser.browserContexts().length, before);
    assert.equal(await owner.page.evaluate(() => 6 * 7), 42);
  });
}
