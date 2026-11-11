import test from 'node:test';
import assert from 'node:assert/strict';
import { connect, ChallengeTimeoutError } from '../dist/index.js';

for (const driver of ['puppeteer', 'playwright']) {
  test(`${driver}: challenge wait distinguishes clearance, timeout and cancellation`, { timeout: 30_000 }, async t => {
    const session = await connect({ driver, headless: true }); t.after(() => session.close());
    await session.page.setContent('<title>Just a moment...</title><div id="challenge-running"></div>');
    await assert.rejects(session.waitForChallenge({ timeout: 200, pollInterval: 25 }), ChallengeTimeoutError);
    await session.page.evaluate(() => setTimeout(() => {
      document.title = 'Ready'; document.body.innerHTML = '<h1 id="ready">Data</h1>';
    }, 100));
    const result = await session.waitForChallenge({ readySelector: '#ready', timeout: 3000, pollInterval: 25, settleTime: 100 });
    assert.equal(result.status, 'ready'); assert.equal(result.detected, true);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(session.waitForChallenge({ signal: controller.signal }), /abort/i);
  });

  test(`${driver}: opt-in Turnstile interaction is bounded and waits for a response`, { timeout: 30_000 }, async t => {
    const session = await connect({ driver, headless: true }); t.after(() => session.close());
    await session.page.setContent(`<div class="cf-turnstile" data-sitekey="fixture" style="width:300px;height:65px"
      onclick="document.querySelector('input').value='fixture-response'">
      <input name="cf-turnstile-response" type="hidden" value=""></div>`);
    const result = await session.waitForChallenge({ clickTurnstile: true, timeout: 2000, pollInterval: 25, settleTime: 100 });
    assert.equal(result.clicks, 1); assert.equal(result.detected, true);
    await session.page.setContent('<div class="cf-turnstile" data-sitekey="fixture" style="width:300px;height:65px"></div>');
    let attempts = 0;
    session.page.on('console', message => { if (message.text() === 'attempt') attempts++; });
    await session.page.evaluate(() => document.querySelector('.cf-turnstile').addEventListener('click', () => console.log('attempt')));
    await assert.rejects(session.waitForChallenge({ clickTurnstile: true, maxClicks: 1, timeout: 350, pollInterval: 25 }), ChallengeTimeoutError);
    assert.equal(attempts, 1);
  });
}
