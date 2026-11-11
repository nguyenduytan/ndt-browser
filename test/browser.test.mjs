import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from '../dist/index.js';
import { fixture } from './fixture.mjs';

for (const driver of ['puppeteer', 'playwright']) {
  test(`${driver}: native automation, extraction and cookie-authenticated POST`, { timeout: 45_000 }, async t => {
    const site = await fixture(); t.after(() => site.close());
    const session = await connect({ driver, headless: true, timeout: 15_000,
      fingerprint: { locale: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh', viewport: { width: 1200, height: 800 } },
      blockResources: ['image'], headers: { 'x-ndt': 'native' } });
    t.after(() => session.close());
    await session.page.goto(`${site.url}/set-cookie`);
    if (driver === 'puppeteer') await session.page.type('#name', 'Tony');
    else await session.page.fill('#name', 'Tony');
    await session.page.click('#save');
    assert.deepEqual(await session.extract({ title: 'h1', result: '#result',
      links: { selector: 'a', attribute: 'href', multiple: true }, missing: '.absent' }),
      { title: 'NDT Browser', result: 'Tony', links: ['/api'], missing: null });
    await assert.rejects(session.extract({ required: { selector: '.absent', required: true } }), /required/i);
    const response = await session.request(`${site.url}/api`, { method: 'POST', json: { name: 'NDT' } });
    assert.equal(response.status, 200);
    assert.deepEqual(response.json(), { method: 'POST', body: { name: 'NDT' }, cookie: 'ndt=session', custom: 'native' });
    assert.equal(site.hits.filter(path => path === '/api').length, 1);
    assert.ok(!site.hits.includes('/pixel.svg'));
    assert.ok(session.stats.blocked >= 1);
    const state = await session.page.evaluate(() => ({ locale: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, width: innerWidth, webdriver: navigator.webdriver }));
    assert.equal(state.locale, 'vi-VN');
    assert.equal(state.timezone, 'Asia/Saigon');
    assert.equal(state.width, 1200);
    assert.equal(state.webdriver, false);
    const second = await session.newPage();
    await second.goto(site.url);
    assert.equal(await second.evaluate(() => innerWidth), 1200);
    await assert.rejects(session.request(`${site.url}/slow`, { timeout: 100 }), /timeout|abort/i);
    await assert.rejects(session.request(`${site.url}/large`, { maxBytes: 128 }), /limit|bytes/i);
    await assert.rejects(session.request('file:///etc/passwd'), /HTTP/i);
    await assert.rejects(session.request(`${site.url}/api`, { method: 'GET', json: {} }), /body|GET/i);
    await assert.rejects(session.request(`${site.url}/api`, { method: 'POST', json: {}, body: 'x' }), /json|body/i);
    const profile = session.profilePath;
    await session.close(); await session.close();
    await assert.rejects(access(profile));
    await assert.rejects(session.newPage(), /closed/i);
  });

  test(`${driver}: persistent profile survives close and rejects simultaneous ownership`, { timeout: 45_000 }, async t => {
    const site = await fixture(); t.after(() => site.close());
    const profile = await mkdtemp(join(tmpdir(), 'ndt-test-'));
    let next;
    t.after(async () => {
      await next?.close();
      await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    });
    const first = await connect({ driver, headless: true, userDataDir: profile });
    t.after(() => first.close());
    await first.page.goto(`${site.url}/set-cookie`);
    await assert.rejects(connect({ driver, headless: true, userDataDir: profile }), /in use|lock/i);
    await first.close();
    next = await connect({ driver, headless: true, userDataDir: profile });
    await next.page.goto(site.url);
    assert.equal((await next.request(`${site.url}/api`)).json().cookie, 'ndt=session');
  });

  test(`${driver}: closing a borrowed browser preserves its original page and cookies`, { timeout: 45_000 }, async t => {
    const site = await fixture(); t.after(() => site.close());
    const owner = await connect({ driver: 'puppeteer', headless: true });
    t.after(() => owner.close());
    await owner.page.goto(`${site.url}/set-cookie`);
    const borrowed = await connect({ driver, endpoint: owner.endpoint });
    t.after(() => borrowed.close());
    await borrowed.page.goto(site.url);
    assert.equal((await borrowed.request(`${site.url}/api`)).json().cookie, '');
    await borrowed.close();
    assert.equal(await owner.page.title(), 'NDT fixture');
    assert.equal((await owner.request(`${site.url}/api`)).json().cookie, 'ndt=session');
  });
}
