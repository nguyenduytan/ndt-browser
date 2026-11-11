import { connect } from '@nguyenduytan/ndt-browser';

const [origin, endpoint] = process.argv.slice(2);
if (!origin || !endpoint) throw new Error('Usage: node api-post.mjs <page-origin-url> <api-url>');
const session = await connect({ driver: 'playwright', headless: true });
try {
  await session.page.goto(origin);
  // Cookies, browser proxy and browser CORS rules apply. POST is never retried.
  const response = await session.request(endpoint, { method: 'POST', json: { name: 'NDT' } });
  console.log(response.status, response.body);
} finally { await session.close(); }
