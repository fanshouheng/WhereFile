const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function request(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port: 4173, path: urlPath }, res => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('Local server timeout')));
  });
}

(async () => {
  const localDirectory = path.resolve(__dirname, '../.local');
  const probeName = `access-test-${randomUUID()}.txt`;
  const probePath = path.join(localDirectory, probeName);
  await fs.mkdir(localDirectory, { recursive: true });
  await fs.writeFile(probePath, 'non-secret access test', { flag: 'wx' });
  try {
    assert.equal(await request('/'), 200);
    assert.equal(await request('/assets/boat-directions.png'), 200);
    for (const prefix of [
      '/.local/',
      '/assets/../.local/',
      '/assets/%2e%2e%2f.local/',
      '/assets/%2e%2e%5c.local%5c',
      '/assets/..%2f.local/',
      '/assets/%2e%2e%2fscripts/',
    ]) {
      const target = prefix.endsWith('scripts/') ? 'imagegen.ps1' : probeName;
      assert.equal(await request(prefix + target), 404, prefix);
    }
    console.log('PASS: scene/assets accessible; local config and encoded traversal blocked.');
  } finally {
    await fs.unlink(probePath);
  }
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
