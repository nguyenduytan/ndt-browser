import { normalizeProxy } from './config.js';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, open, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { browserPath } from './config.js';
import type { BrowserOptions } from './types.js';

export interface LaunchedBrowser {
  endpoint: string;
  profilePath: string;
  stop(): Promise<void>;
}

async function terminate(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  // Give Browser.close time to flush cookies before the process fallback.
  for (let i = 0; i < 20 && child.exitCode === null && child.signalCode === null; i++) await delay(100);
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    await new Promise<void>((resolve, reject) => {
      execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, error => {
        if (error && child.exitCode === null && child.signalCode === null) reject(error);
        else resolve();
      });
    });
  } else {
    child.kill('SIGTERM');
    for (let i = 0; i < 30 && child.exitCode === null && child.signalCode === null; i++) await delay(100);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
  for (let i = 0; i < 30 && child.exitCode === null && child.signalCode === null; i++) await delay(100);
  if (child.exitCode === null && child.signalCode === null) throw new Error('Browser process did not terminate; profile retained');
}

export async function launch(options: BrowserOptions): Promise<LaunchedBrowser> {
  const proxy = normalizeProxy(options.proxy);
  const executable = browserPath(options.executablePath);
  const temporary = !options.userDataDir;
  const profilePath = temporary ? await mkdtemp(join(tmpdir(), 'ndt-browser-')) : resolve(options.userDataDir!);
  await mkdir(profilePath, { recursive: true, mode: 0o700 });
  const lockPath = join(profilePath, '.ndt-lock');
  const lock = await open(lockPath, 'wx', 0o600).catch(() => {
    throw new Error('Browser profile is in use or locked. Use a dedicated profile; remove .ndt-lock only after checking no browser owns it.');
  });
  let child: ChildProcess | undefined;
  let stopped: Promise<void> | undefined;
  const stop = () => stopped ??= (async () => {
    if (child) await terminate(child);
    if (child?.pid) await rm(join(profilePath, 'DevToolsActivePort'), { force: true });
    await lock.close();
    await rm(lockPath, { force: true });
    if (temporary) await rm(profilePath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  })();
  try {
    const portFile = join(profilePath, 'DevToolsActivePort');
    const existing = await access(portFile).then(() => true, () => false);
    if (existing) throw new Error('Profile has an existing DevToolsActivePort; refusing to attach to a possibly running browser');
    const args = [
      `--user-data-dir=${profilePath}`, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
      '--no-first-run', '--no-default-browser-check',
      ...(options.headless ? ['--headless=new'] : []),
      ...(options.reduceAutomationSignals !== false ? ['--disable-blink-features=AutomationControlled'] : []),
      ...(options.fingerprint?.locale ? [`--lang=${options.fingerprint.locale}`] : []),
      ...(proxy ? [`--proxy-server=${proxy.server}`] : []),
      ...(options.args ?? []), 'about:blank',
    ];
    child = spawn(executable, args, { stdio: 'ignore', windowsHide: options.headless ?? false });
    let spawnError: Error | undefined;
    child.on('error', error => { spawnError = error; });
    const deadline = Date.now() + (options.timeout ?? 30_000);
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error('Browser exited before CDP was ready. Check profile ownership, display and browser arguments.');
      const content = await readFile(portFile, 'utf8').catch(() => '');
      const [port, path] = content.trim().split(/\r?\n/);
      if (port && /^\d+$/.test(port) && path?.startsWith('/devtools/browser/'))
        return { endpoint: `ws://127.0.0.1:${port}${path}`, profilePath, stop };
      await delay(50);
    }
    throw new Error('Browser startup timeout');
  } catch (error) {
    await stop();
    throw error;
  }
}
