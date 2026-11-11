import assert from 'node:assert/strict';
import { connect } from '../dist/index.js';
import { fixture } from './fixture.mjs';

const site = await fixture();
try {
  for (const driver of ['puppeteer', 'playwright']) {
    const session = await connect({ driver, headless: false });
    try {
      await session.page.goto(site.url);
      assert.deepEqual(await session.extract({ title: 'h1' }), { title: 'NDT Browser' });
      console.log(`${driver}: headed/Xvfb passed`);
    } finally { await session.close(); }
  }
} finally { await site.close(); }
