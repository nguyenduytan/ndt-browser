import { createServer } from 'node:http';

export async function fixture() {
  const hits = [];
  const server = createServer(async (req, res) => {
    hits.push(req.url);
    if (req.url === '/slow') return;
    if (req.url === '/large') { res.end('x'.repeat(8192)); return; }
    if (req.url === '/api') {
      let body = '';
      for await (const chunk of req) body += chunk;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ method: req.method, body: body ? JSON.parse(body) : null,
        cookie: req.headers.cookie ?? '', custom: req.headers['x-ndt'] ?? '' }));
      return;
    }
    if (req.url === '/pixel.svg') {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.end('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"></svg>');
      return;
    }
    if (req.url === '/set-cookie') {
      res.setHeader('Set-Cookie', 'ndt=session; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax');
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html><title>NDT fixture</title><body>
      <h1> NDT Browser </h1><a href="/api">API</a>
      <input id="name"><button id="save" onclick="document.querySelector('#result').textContent=document.querySelector('#name').value">Save</button>
      <p id="result"></p><img src="/pixel.svg"><script>window.fixtureReady=true</script>
    </body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, hits,
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
