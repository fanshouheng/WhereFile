const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const root = path.resolve(__dirname, '..');
  const { createSiteServer } = await import(pathToFileURL(path.join(__dirname, 'site-server.mjs')));
  const server = createSiteServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  const request = (urlPath, method = 'GET') => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('Site request timeout')));
    req.end();
  });
  try {
    assert.equal((await request('/')).status, 200);
    assert.equal((await request('/assets/coast-hd.webp')).status, 200);
    for (const [file, mime] of [['index.html', 'text/html'], ['workshop.css', 'text/css'], ['workshop.js', 'text/javascript'], ['preview.js', 'text/javascript']]) {
      const response = await request('/workshop/' + file);
      assert.equal(response.status, 200, file);
      assert.ok(response.headers['content-type'].startsWith(mime), file);
      assert.ok(response.body.equals(await fs.readFile(path.join(root, 'website/workshop', file))), `Stale workshop resource: ${file}`);
    }
    assert.match((await request('/')).body.toString(), /href="\/workshop\/"/);
    for (const [file, mime] of [['index.html', 'text/html'], ['grassland.css', 'text/css'],
      ['grassland.js', 'text/javascript'], ['assets/grassland.webp', 'image/webp'], ['assets/sheep.png', 'image/png']]) {
      const response = await request('/previews/grassland/' + file);
      assert.equal(response.status, 200, file);
      assert.ok(response.headers['content-type'].startsWith(mime), file);
      assert.ok(response.body.equals(await fs.readFile(path.join(root, 'previews/grassland', file))), `Stale theme resource: ${file}`);
    }
    assert.equal((await request('/previews/grassland/')).status, 200);
    assert.equal((await request('/themes/grassland.webp')).status, 200);
    for (const file of ['README.md', 'prompts/theme-grassland-background.txt', 'assets/wolfcastle.png']) {
      assert.equal((await request('/previews/grassland/' + file)).status, 404);
    }
    console.log('PASS: complete grassland preview, current runtime assets and public resource allowlist.');
    const metadataResponse = await request('/download.json');
    assert.equal(metadataResponse.status, 200);
    const metadata = JSON.parse(metadataResponse.body);
    if (metadata.verified) {
      const installerPath = '/' + metadata.url;
      const installer = await request(installerPath);
      assert.equal(installer.status, 200);
      assert.match(installer.headers['content-disposition'], /^attachment;/);
      assert.equal(installer.body.length, metadata.size);
      assert.equal(createHash('sha256').update(installer.body).digest('hex'), metadata.sha256);
      const source = await fs.readFile(path.join(root, 'output/installer', path.basename(metadata.url)));
      assert.ok(source.equals(installer.body), 'Downloaded installer differs from the built installer');
      const head = await request(installerPath, 'HEAD');
      assert.equal(head.status, 200);
      assert.equal(Number(head.headers['content-length']), metadata.size);
      assert.equal(head.body.length, 0);
      console.log('PASS: complete installer download, source hash, file size, attachment and HEAD response.');
    } else {
      assert.match(metadata.url, /^https:\/\//);
      assert.equal(metadata.size, null);
      assert.equal(metadata.sha256, null);
      console.log('PASS: external download is explicitly unverified; no borrowed size or checksum.');
    }
    for (const urlPath of ['/.local/ppdog-key.xml', '/.git/config', '/package.json', '/scripts/site-build.mjs',
      '/workshop/schema.sql', '/workshop/api.mjs', '/.dev.vars', '/functions/api/workshop/anything.js',
      '/../installer/SHA256SUMS.txt', '/%2e%2e/installer/SHA256SUMS.txt', '/assets/%2e%2e%5c%2e%2e%5c.local%5cppdog-key.xml', '/missing.html']) {
      assert.equal((await request(urlPath)).status, 404, urlPath);
    }
    assert.equal((await request('/', 'POST')).status, 405);
    console.log('PASS: public website resources only; traversal, private files, missing files and unsupported methods rejected.');
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
