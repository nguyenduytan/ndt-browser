import { connect } from '@nguyenduytan/ndt-browser';

const session = await connect({ driver: 'puppeteer', headless: true });
try {
  await session.page.goto(process.argv[2] ?? 'https://example.com', { waitUntil: 'domcontentloaded' });
  console.log(await session.extract({ title: 'h1', links: { selector: 'a', attribute: 'href', multiple: true } }));
  // Native Puppeteer remains available: page.click(), page.type(), page.evaluate(),
  // page.waitForResponse(), page.screenshot(), keyboard, mouse, frames and uploads.
} finally { await session.close(); }
