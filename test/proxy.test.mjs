import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { connect } from '../dist/index.js';

for (const driver of ['puppeteer', 'playwright']) {
  test(`${driver}: authenticated proxy carries browser API POST without direct fallback`, { timeout: 30_000 }, async t => {
    const requests = [];
    const sockets = new Set();
    const proxy = createServer(async (req, res) => {
      if (req.headers['proxy-authorization'] !== `Basic ${Buffer.from('ndt:secret').toString('base64')}`) {
        res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="NDT fixture"' }); res.end(); return;
      }
      if (!req.url.startsWith('http://ndt.invalid/')) { res.writeHead(502); res.end(); return; }
      let body = '';
      for await (const chunk of req) body += chunk;
      requests.push({ method: req.method, url: req.url, body });
      if (req.url.endsWith('/api')) {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ body: JSON.parse(body), cookie: req.headers.cookie }));
      } else {
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Set-Cookie', 'proxySession=yes; Path=/; HttpOnly');
        res.end('<title>Proxy fixture</title><h1>Routed</h1>');
      }
    });
    proxy.on('connection', socket => {
      sockets.add(socket); socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => {}); // Chromium cancels background CONNECT requests.
    });
    proxy.on('connect', (_req, socket) => socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'));
    await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
    let session;
    t.after(async () => {
      await session?.close();
      proxy.closeAllConnections();
      for (const socket of sockets) socket.destroy();
      await new Promise(resolve => proxy.close(resolve));
    });
    session = await connect({ driver, headless: true, timeout: 10_000,
      proxy: { server: `http://127.0.0.1:${proxy.address().port}`, username: 'ndt', password: 'secret' } });
    await session.page.goto('http://ndt.invalid/');
    assert.equal(await session.page.title(), 'Proxy fixture');
    const response = await session.request('http://ndt.invalid/api', { method: 'POST', json: { routed: true } });
    assert.deepEqual(response.json(), { body: { routed: true }, cookie: 'proxySession=yes' });
    assert.equal(requests.filter(request => request.method === 'POST').length, 1);
  });
}
