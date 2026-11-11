import { connect } from '@nguyenduytan/ndt-browser';

const session = await connect({ driver: 'playwright', headless: true });
try {
  await session.page.goto(process.argv[2] ?? 'https://example.com', { waitUntil: 'domcontentloaded' });
  console.log(await session.page.locator('h1').innerText());
  // Native Playwright remains available: page.getByRole(), locator.fill(),
  // locator.click(), page.evaluate(), screenshots, downloads and frames.
} finally { await session.close(); }
