import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { connect as socketConnect } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect, BrowserSession, ChallengeTimeoutError } from '../dist/index.js';
import { validateOptions } from '../dist/config.js';
import { fixture } from './fixture.mjs';

test('CDP headers require an endpoint and valid string headers', () => {
  assert.throws(() => validateOptions({ connectHeaders: { Authorization: 'secret' } }), /endpoint/);
  for (const connectHeaders of [null, [], { Authorization: 1 }, { Authorization: 'bad\r\nheader' }])
    assert.throws(() => validateOptions({ endpoint: 'ws://localhost:9222', connectHeaders }));
});

test('shutdown falls back only for owned processes and disconnects stalled remote contexts', async () => {
  let stopped = 0, disconnected = 0;
  const context = { on() {}, off() {}, close: () => new Promise(() => {}) };
  const browser = { close: () => new Promise(() => {}), disconnect: async () => { disconnected++; } };
  const local = new BrowserSession('puppeteer', browser, context, '', { timeout: 30 },
    { stop: async () => { stopped++; } });
  await assert.rejects(local.close(), /timed out/);
  assert.equal(stopped, 1);
  const remote = new BrowserSession('puppeteer', browser, context, '', { timeout: 30 });
  const closing = remote.close();
  assert.equal(remote.close(), closing);
  await assert.rejects(closing, /timed out/);
  assert.equal(disconnected, 1);
  assert.equal(stopped, 1);
});

for (const driver of ['puppeteer', 'playwright']) {
  test(`${driver}: popup configuration, iframe actions, diagnostics and recovery`, { timeout: 45000 }, async t => {
    const site = await fixture(); t.after(() => site.close());
    const directory = await mkdtemp(join(tmpdir(), 'ndt-diagnostics-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const session = await connect({ driver, headless: true, timeout: 5000,
      headers: { 'x-ndt': 'popup' }, fingerprint: { timezone: 'Asia/Tokyo' } });
    t.after(() => session.close());
    await session.goto(site.url, { readyUrl: site.url + '/', readySelector: 'h1', settleTime: 20 });
    const popupPromise = driver === 'playwright' ? session.page.waitForEvent('popup') :
      new Promise(resolve => session.page.once('popup', resolve));
    await session.page.evaluate(url => window.open(url), site.url);
    const popup = await popupPromise;
    // Observe automatic configuration without explicitly calling configurePage.
    for (let i = 0; i < 100; i++) {
      if (await popup.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone) === 'Asia/Tokyo') break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(await popup.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone), 'Asia/Tokyo');
    let custom;
    for (let i = 0; i < 100; i++) {
      custom = await popup.evaluate(async url => (await (await fetch(url)).json()).custom, site.url + '/api');
      if (custom === 'popup') break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(custom, 'popup');
    await popup.close();
    await session.page.bringToFront();
    await session.page.evaluate(() => {
      const frame = document.createElement('iframe'); frame.src = '/'; document.body.append(frame);
    });
    let frame;
    for (let i = 0; i < 100; i++) {
      frame = session.page.frames().find(item => item !== session.page.mainFrame() && item.url().startsWith(site.url));
      if (frame) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.ok(frame);
    await frame.waitForSelector('#name');
    if (driver === 'playwright') await frame.locator('#name').fill('iframe');
    else await frame.type('#name', 'iframe');
    await frame.click('#save');
    assert.equal(await frame.$eval('#result', element => element.textContent), 'iframe');
    const screenshot = join(directory, 'timeout.png');
    await assert.rejects(session.waitForChallenge({ timeout: 120, readyUrl: site.url + '/missing', screenshotOnTimeout: screenshot }), error => {
      assert.ok(error instanceof ChallengeTimeoutError);
      assert.equal(error.diagnostics.reason, 'readiness');
      assert.equal(error.diagnostics.url, site.url + '/');
      assert.equal(error.diagnostics.screenshotPath, screenshot);
      return true;
    });
    assert.equal((await readFile(screenshot)).subarray(1, 4).toString(), 'PNG');
    // A stuck renderer cannot run the polling evaluate or its own timers.
    void session.page.evaluate(() => { while (true) {} }).catch(() => {});
    await assert.rejects(session.waitForChallenge({ timeout: 150 }), error => {
      assert.equal(error.diagnostics.reason, 'page-unresponsive'); return true;
    });
    await assert.rejects(session.request(site.url + '/api', { timeout: 100 }), /timed out/);
    const old = session.page;
    await session.recoverPage();
    assert.equal(old.isClosed(), true);
    assert.notEqual(session.page, old);
    assert.equal(await session.page.evaluate(() => 42), 42);
  });

  test(`${driver}: authenticated HTTP/WS CDP leaves owner alive and token off website`, { timeout: 45000 }, async t => {
    const owner = await connect({ headless: true }); t.after(() => owner.close());
    const upstream = new URL(owner.endpoint);
    const sockets = new Set();
    let base;
    let handshakes = 0;
    const gateway = createServer((req, res) => {
      if (req.headers.authorization !== 'Bearer fixture-token') { res.writeHead(401).end(); return; }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ webSocketDebuggerUrl: base.replace('http:', 'ws:') + upstream.pathname }));
    });
    gateway.on('upgrade', (req, socket, head) => {
      if (req.headers.authorization !== 'Bearer fixture-token') { socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n'); return; }
      handshakes++;
      const peer = socketConnect(Number(upstream.port), upstream.hostname, () => {
        const headers = Object.entries(req.headers).filter(([key]) => key !== 'authorization' && key !== 'host');
        peer.write(`GET ${upstream.pathname} HTTP/1.1\r\nHost: ${upstream.host}\r\n` +
          headers.map(([key, value]) => `${key}: ${value}\r\n`).join('') + '\r\n');
        if (head.length) peer.write(head);
        socket.pipe(peer).pipe(socket);
      });
      peer.on('error', () => socket.destroy()); socket.on('error', () => peer.destroy());
      socket.on('close', () => peer.destroy());
    });
    gateway.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
    await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${gateway.address().port}`;
    t.after(() => { for (const socket of sockets) socket.destroy(); return new Promise(resolve => gateway.close(resolve)); });
    const site = createServer((req, res) => res.end(req.headers.authorization ?? 'no-token'));
    await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { site.closeAllConnections(); site.close(resolve); }));
    for (const endpoint of [base, base.replace('http:', 'ws:') + upstream.pathname]) {
      const session = await connect({ driver, endpoint, connectHeaders: { Authorization: 'Bearer fixture-token' } });
      try {
        await session.page.goto(`http://127.0.0.1:${site.address().port}`);
        assert.equal(await session.page.evaluate(() => document.body.textContent), 'no-token');
      } finally { await session.close(); }
    }
    assert.equal(handshakes, 2);
    assert.equal(await owner.page.evaluate(() => 42), 42);
  });
}
