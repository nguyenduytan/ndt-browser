#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { connect } from './index.js';
import { httpUrl } from './config.js';
import type { Driver, ExtractionSchema } from './types.js';

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    driver: { type: 'string', default: 'puppeteer' }, headless: { type: 'boolean', default: false },
    executable: { type: 'string' }, profile: { type: 'string' }, endpoint: { type: 'string' },
    selector: { type: 'string' }, schema: { type: 'string' }, timeout: { type: 'string', default: '30000' },
    help: { type: 'boolean', short: 'h' },
  } });
  if (values.help || positionals.length === 0) {
    console.log('Usage: ndt-browser scrape <url> [--driver puppeteer|playwright] [--headless]\n' +
      '  [--executable <path>] [--profile <directory>] [--endpoint <CDP URL>]\n' +
      '  [--selector <CSS> | --schema <JSON file>] [--timeout <milliseconds>]\n' +
      'Returns JSON. Without a schema, extracts title and body text. Use the SDK for automation.');
    return;
  }
  if (positionals.length !== 2 || positionals[0] !== 'scrape') throw new Error('Expected: scrape <url>');
  const url = httpUrl(positionals[1]!).href;
  if (values.selector && values.schema) throw new Error('Choose --selector or --schema');
  const schema: ExtractionSchema = values.schema ? JSON.parse(await readFile(values.schema, 'utf8')) :
    values.selector ? { value: values.selector } : { title: 'title', text: 'body' };
  const session = await connect({ driver: values.driver as Driver, headless: values.endpoint ? undefined : values.headless,
    executablePath: values.executable, userDataDir: values.profile, endpoint: values.endpoint, timeout: Number(values.timeout) });
  const stop = () => { void session.close().then(() => { process.exitCode = 130; }, () => { process.exitCode = 1; }); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    const response = await session.page.goto(url, { waitUntil: 'domcontentloaded' });
    console.log(JSON.stringify({ url: session.page.url(), status: response?.status(), data: await session.extract(schema) }));
  } finally {
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    await session.close();
  }
}

main().catch(error => {
  // Browser errors can contain URL credentials; omit them from CLI diagnostics.
  const message = String(error instanceof Error ? error.message : error).replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1[redacted]@');
  console.error(`NDT: ${message}`); process.exitCode = 1;
});
