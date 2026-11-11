import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { BrowserOptions } from './types.js';

export function positive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${name} must be positive and finite`);
}
export function httpUrl(value: string): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new TypeError('Expected an HTTP(S) URL without embedded credentials');
  return url;
}
export function validateOptions(options: BrowserOptions): void {
  if (!options || typeof options !== 'object') throw new TypeError('Options must be an object');
  if (options.driver !== undefined && !['playwright', 'puppeteer'].includes(options.driver))
    throw new TypeError('driver must be puppeteer or playwright');
  positive(options.timeout ?? 30_000, 'timeout');
  for (const key of ['headless', 'reduceAutomationSignals'] as const)
    if (options[key] !== undefined && typeof options[key] !== 'boolean') throw new TypeError(`${key} must be boolean`);
  for (const key of ['userDataDir', 'executablePath'] as const)
    if (options[key] !== undefined && (typeof options[key] !== 'string' || !options[key]!.trim()))
      throw new TypeError(`${key} must be a non-empty path`);
  if (options.endpoint) {
    const url = new URL(options.endpoint);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) throw new TypeError('Invalid CDP endpoint');
    if (options.userDataDir || options.executablePath || options.args?.length || options.proxy || options.headless !== undefined)
      throw new TypeError('Remote connections cannot change browser launch/profile/proxy settings');
  }
  if (options.args !== undefined && !Array.isArray(options.args)) throw new TypeError('args must be an array');
  for (const arg of options.args ?? []) {
    if (typeof arg !== 'string' || !arg.startsWith('--') || /[\r\n\0]/.test(arg) ||
      /^--(user-data-dir|remote-debugging-[^=]+|proxy-[^=]+|headless)(=|$)/.test(arg))
      throw new TypeError('args must be browser flags; configure profile, CDP, headless and proxy through named options');
  }
  const proxy = options.proxy;
  if (proxy) {
    const url = new URL(proxy.server);
    if (!['http:', 'https:', 'socks5:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '' && url.pathname !== '/' || url.search || url.hash)
      throw new TypeError('proxy.server must be an HTTP(S)/SOCKS5 endpoint without credentials or path');
    if ((proxy.username === undefined) !== (proxy.password === undefined))
      throw new TypeError('Proxy username and password must be provided together');
    if (url.protocol === 'socks5:' && proxy.username !== undefined)
      throw new TypeError('Chromium does not support authenticated SOCKS5; use an HTTP proxy');
  }
  const fp = options.fingerprint;
  if (fp?.viewport) {
    for (const name of ['width', 'height'] as const) {
      positive(fp.viewport[name], `viewport.${name}`);
      if (!Number.isInteger(fp.viewport[name])) throw new TypeError('Viewport dimensions must be integers');
    }
    positive(fp.viewport.deviceScaleFactor ?? 1, 'deviceScaleFactor');
  }
  if (fp?.locale) new Intl.Locale(fp.locale);
  if (fp?.timezone) new Intl.DateTimeFormat('en', { timeZone: fp.timezone });
  if (fp?.userAgentMetadata && !fp.userAgent) throw new TypeError('userAgentMetadata requires userAgent');
  if (options.blockResources !== undefined && !Array.isArray(options.blockResources))
    throw new TypeError('blockResources must be an array');
  for (const type of options.blockResources ?? [])
    if (!['image', 'media', 'font', 'stylesheet'].includes(type)) throw new TypeError(`Unsupported resource type: ${type}`);
  for (const [name, value] of Object.entries(options.headers ?? {})) new Headers({ [name]: value });
}

export function browserPath(explicit?: string): string {
  const configured = explicit ?? process.env.NDT_BROWSER_PATH;
  if (configured) {
    const path = resolve(configured);
    if (!existsSync(path) || !statSync(path).isFile()) throw new Error('Configured browser executable does not exist');
    return path;
  }
  const paths = process.platform === 'win32' ? [
    join(process.env.PROGRAMFILES ?? 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] ?? 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
    join(process.env.LOCALAPPDATA ?? homedir(), 'Google/Chrome/Application/chrome.exe'),
  ] : process.platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ] : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const found = paths.find(path => existsSync(path));
  if (!found) throw new Error('No Chrome/Chromium found. Set executablePath or NDT_BROWSER_PATH; NDT never downloads a browser implicitly.');
  return found;
}
