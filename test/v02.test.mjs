import test from 'node:test';
import assert from 'node:assert/strict';
import { bounded } from '../dist/deadline.js';
import { connect } from '../dist/index.js';
import { fixture } from './fixture.mjs';

test('deadline and abort reject even when browser operation never settles', async () => {
  await assert.rejects(bounded(new Promise(() => {}), 30), /timed out/);
  const controller = new AbortController();
  const pending = bounded(new Promise(() => {}), 5000, controller.signal);
  controller.abort(); await assert.rejects(pending, /abort/i);
});
for (const driver of ['puppeteer', 'playwright']) test(`${driver}: v0.2 navigation, visible readiness and paced actions`, { timeout: 30000 }, async t => {
  const site = await fixture(); t.after(() => site.close());
  const session = await connect({ driver, headless: true, humanize: true }); t.after(() => session.close());
  await session.goto(site.url, { readySelector: 'h1', settleTime: 30 });
  await session.type('#name', 'NDT'); await session.click('#save');
  assert.deepEqual(await session.extract({ result: '#result' }), { result: 'NDT' });
  await session.scroll(100);
  await session.page.setContent('<h1 style="display:none" id="ready">Hidden</h1>');
  await assert.rejects(session.waitForChallenge({ readySelector: '#ready', timeout: 120, settleTime: 20 }), /timeout/i);
});
