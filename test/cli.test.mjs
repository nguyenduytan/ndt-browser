import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fixture } from './fixture.mjs';
const run = promisify(execFile);
test('CLI prints machine-readable extraction and exits after closing Chrome', { timeout: 30_000 }, async t => {
  const site = await fixture(); t.after(() => site.close());
  const { stdout, stderr } = await run(process.execPath, ['dist/cli.js', 'scrape', site.url, '--headless', '--selector', 'h1'], { timeout: 25_000 });
  assert.equal(stderr, '');
  assert.deepEqual(JSON.parse(stdout).data, { value: 'NDT Browser' });
});
test('CLI rejects unknown flags and unsupported URL schemes before launching', async () => {
  await assert.rejects(run(process.execPath, ['dist/cli.js', 'scrape', 'https://example.com', '--unknown']), error => error.code === 1);
  await assert.rejects(run(process.execPath, ['dist/cli.js', 'scrape', 'file:///secret']), error => error.code === 1);
});
