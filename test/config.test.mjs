import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOptions, browserPath } from '../dist/config.js';

test('rejects driver and launch settings that would silently change ownership or routing', () => {
  for (const options of [
    { driver: 'selenium' }, { timeout: 0 }, { timeout: Infinity },
    { args: ['--user-data-dir=elsewhere'] }, { args: ['--remote-debugging-port=9222'] },
    { args: ['--proxy-server=http://elsewhere'] },
    { endpoint: 'file:///tmp/browser' },
    { endpoint: 'http://localhost:9222', userDataDir: 'profile' },
    { proxy: { server: 'http://user:secret@proxy:8080' } },
    { proxy: { server: 'socks5://proxy:1080', username: 'u', password: 'p' } },
    { fingerprint: { viewport: { width: -1, height: 700 } } },
    { fingerprint: { timezone: 'Not/AZone' } },
    { fingerprint: { userAgentMetadata: { platform: 'Windows' } } },
    { blockResources: ['document'] },
  ]) assert.throws(() => validateOptions(options));
});

test('accepts explicit native-browser controls without rewriting them', () => {
  const options = { driver: 'playwright', timeout: 1500, headless: true,
    fingerprint: { locale: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh', viewport: { width: 1280, height: 720 } },
    proxy: { server: 'http://127.0.0.1:8080', username: 'user', password: 'secret' },
    blockResources: ['image', 'font'], args: ['--disable-dev-shm-usage'] };
  assert.doesNotThrow(() => validateOptions(options));
});

test('an invalid explicit browser path fails rather than falling back to another browser', () => {
  assert.throws(() => browserPath('/no-such-browser/ndt.exe'), /browser|executable/i);
});
