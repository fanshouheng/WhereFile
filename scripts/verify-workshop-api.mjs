import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { handleWorkshop } from '../workshop/api.mjs';

const database = new DatabaseSync(':memory:');
database.exec(await readFile(new URL('../workshop/schema.sql', import.meta.url), 'utf8'));
let queries = 0;
const DB = {
  prepare(sql) {
    const statement = database.prepare(sql);
    let values = [];
    const bound = {
      bind(...parameters) { values = parameters; return bound; },
      async first() { queries++; return statement.get(...values) || null; },
      async all() { queries++; return { results: statement.all(...values) }; },
      async run() { queries++; return statement.run(...values); },
    };
    return bound;
  },
};
const objects = new Map();
const THEME_ASSETS = {
  async put(key, bytes) { assert.equal(typeof key, 'string'); objects.set(key, new Uint8Array(bytes)); },
  async get(key, options) {
    assert.deepEqual(options, { type: 'arrayBuffer' }, 'KV binary reads must request arrayBuffer');
    const bytes = objects.get(key);
    return bytes ? bytes.slice().buffer : null;
  },
  async delete(key) { assert.equal(typeof key, 'string', 'KV deletes accept one key'); objects.delete(key); },
};
const env = { DB, THEME_ASSETS, WORKSHOP_ADMIN_TOKEN: 'admin-test-'.repeat(5), WORKSHOP_RATE_SALT: 'rate-salt-test-'.repeat(3) };
const base = 'https://wherefile.example/api/workshop';
const adminHeaders = { Authorization: `Bearer ${env.WORKSHOP_ADMIN_TOKEN}` };
const call = (route, options = {}, bindings = env) => handleWorkshop(new Request(base + route, options), bindings);
const dataOf = async response => ({ status: response.status, data: await response.json() });
const background = await readFile(new URL('../assets/coast-hd.webp', import.meta.url));
const sprite = await readFile(new URL('../assets/boat-hd.png', import.meta.url));
function submission() {
  const form = new FormData();
  const fields = {
    title: 'API 验证主题', author: '自动验证', description: '仅供本地接口验证。',
    provenance: '使用项目既有素材，仅供本地测试，不公开发布。', rightsAccepted: 'true', license: 'personal-use',
    config: JSON.stringify({ schema_version: 1, name: 'API 验证主题', renderer: 'static', background: 'background.webp', sprite: 'object.png', region: [.1, .2, .9, .9], object_scale: .09, motion: 'float', duration: 48, forward_degrees: 0 }),
  };
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  form.set('background', new Blob([background], { type: 'image/webp' }), 'background.webp');
  form.set('sprite', new Blob([sprite], { type: 'image/png' }), 'object.png');
  return form;
}

try {
  const before = queries;
  assert.equal((await call('/moderation')).status, 401);
  assert.equal((await call('/moderation/reports')).status, 401);
  assert.equal((await call('/moderation', { headers: { Authorization: 'Bearer ' + 'x'.repeat(40) } })).status, 401);
  assert.equal((await call('/submissions/00000000-0000-4000-8000-000000000000')).status, 401);
  assert.equal(queries, before, 'Unauthorized requests must not query submissions');
  assert.equal((await call('/submissions', { method: 'POST', headers: { Origin: 'https://elsewhere.example' } })).status, 403);
  assert.equal((await call('/themes', {}, {})).status, 503);
  assert.equal((await call('/moderation', {}, { ...env, WORKSHOP_ADMIN_TOKEN: '' })).status, 503);
  assert.equal((await call('/submissions', { method: 'POST', body: submission() }, { ...env, WORKSHOP_RATE_SALT: '' })).status, 503);
  console.log('PASS: same-origin writes, missing configuration, and authentication before database access.');

  const uploaded = await dataOf(await call('/submissions', { method: 'POST', body: submission() }));
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
  const { submission: receipt, receiptToken } = uploaded.data;
  const id = receipt.id;
  assert.equal(receipt.status, 'pending');
  assert.equal(receiptToken.length, 64);
  assert.equal(objects.size, 2);
  const imageBytes = background.byteLength + sprite.byteLength;
  const quota = () => database.prepare('SELECT bytes FROM storage_quota WHERE id = 1').get().bytes;
  assert.equal(quota(), imageBytes);
  const stored = database.prepare('SELECT * FROM submissions WHERE id = ?').get(id);
  assert.notEqual(stored.receipt_hash, receiptToken, 'Only the receipt token hash may be stored');
  assert.equal(stored.receipt_hash.length, 64);
  assert.equal((await call(`/submissions/${id}`, { headers: { Authorization: 'Bearer ' + 'z'.repeat(64) } })).status, 404);
  const pendingReceipt = await dataOf(await call(`/submissions/${id}`, { headers: { Authorization: `Bearer ${receiptToken}` } }));
  assert.equal(pendingReceipt.data.submission.status, 'pending');
  assert.equal(JSON.stringify(pendingReceipt.data).includes('receipt_hash'), false);
  assert.deepEqual((await dataOf(await call('/themes'))).data.themes, []);
  for (const path of ['', '/assets/background', '/assets/sprite', '/download']) assert.equal((await call(`/themes/${id}${path}`)).status, 404);
  console.log('PASS: real multipart images persist privately; receipt tokens are hashed and pending assets cannot be fetched publicly.');

  const queue = await dataOf(await call('/moderation', { headers: adminHeaders }));
  assert.equal(queue.data.submissions.length, 1);
  assert.equal(queue.data.submissions[0].id, id);
  assert.equal((await call(`/moderation/${id}/assets/background`, { headers: adminHeaders })).status, 200);
  assert.equal((await call(`/moderation/${id}/assets/background`)).status, 401);
  const syncingAssets = { ...THEME_ASSETS, async get(key, options) { return key.endsWith('/sprite') ? null : THEME_ASSETS.get(key, options); } };
  const approvalOptions = { method: 'POST', headers: { ...adminHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) };
  const syncing = await call(`/moderation/${id}`, approvalOptions, { ...env, THEME_ASSETS: syncingAssets });
  assert.equal(syncing.status, 503);
  assert.equal(syncing.headers.get('Retry-After'), '60');
  assert.equal((await syncing.json()).error.code, 'assets_syncing');
  assert.equal(database.prepare('SELECT status FROM submissions WHERE id = ?').get(id).status, 'pending');
  assert.equal((await call(`/moderation/${id}/assets/sprite`, { method: 'HEAD', headers: adminHeaders }, { ...env, THEME_ASSETS: syncingAssets })).status, 503);
  const approve = await call(`/moderation/${id}`, { method: 'POST', headers: { ...adminHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) });
  assert.equal(approve.status, 200);
  const publicTheme = (await dataOf(await call(`/themes/${id}`))).data.theme;
  assert.equal(publicTheme.title, receipt.title);
  assert.equal(publicTheme.assets.sprite, `/api/workshop/themes/${id}/assets/sprite`);
  assert.equal('receipt_hash' in publicTheme, false);
  assert.equal((await dataOf(await call('/themes'))).data.themes.length, 1);
  const image = await call(`/themes/${id}/assets/sprite`);
  assert.equal(image.headers.get('Content-Type'), 'image/png');
  assert.equal(image.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()), new Uint8Array(sprite));
  const head = await call(`/themes/${id}/assets/background`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(Number(head.headers.get('Content-Length')), background.byteLength);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  const archive = await call(`/themes/${id}/download`);
  assert.equal(archive.headers.get('Content-Type'), 'application/zip');
  assert.match(archive.headers.get('Content-Disposition'), /^attachment;/);
  const bytes = new Uint8Array(await archive.arrayBuffer());
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50);
  assert.ok(new TextDecoder().decode(bytes).includes('当前 Windows 版尚不支持导入主题包'));
  const lateSync = await call(`/themes/${id}/download`, {}, { ...env, THEME_ASSETS: syncingAssets });
  assert.equal(lateSync.status, 503);
  assert.equal(lateSync.headers.get('Retry-After'), '60');
  const failedRead = await call(`/themes/${id}/assets/sprite`, {}, { ...env, THEME_ASSETS: { ...THEME_ASSETS, async get() { throw new Error('KV read limit'); } } });
  assert.equal(failedRead.status, 503);
  assert.equal((await failedRead.json()).error.code, 'storage_unavailable');
  console.log('PASS: approval publishes the trusted theme contract, raster assets, HEAD metadata, and downloadable ZIP.');
  console.log('PASS: KV binary reads, missing replica assets and read failures return retryable errors; unsynchronized themes cannot be approved.');

  const reportBody = { themeId: id, reason: '这是自动化验证测试的反馈原因。', contact: '' };
  assert.equal((await call('/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reportBody) })).status, 201);
  assert.equal(database.prepare('SELECT count(*) AS count FROM reports').get().count, 1);
  const inbox = (await dataOf(await call('/moderation/reports', { headers: adminHeaders }))).data.reports;
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].themeId, id);
  assert.equal(inbox[0].reason, reportBody.reason);
  assert.equal(typeof inbox[0].createdAt, 'string');
  assert.equal((await call('/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...reportBody, reason: '短' }) })).status, 400);
  assert.equal((await call(`/moderation/${id}`, { method: 'POST', headers: { ...adminHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'rejected', reason: '' }) })).status, 400);
  const reject = await call(`/moderation/${id}`, { method: 'POST', headers: { ...adminHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'rejected', reason: '本地验证已结束。' }) });
  assert.equal(reject.status, 200);
  assert.equal(quota(), imageBytes, 'Rejected themes remain counted until their data is deliberately removed');
  for (const path of ['', '/assets/background', '/assets/sprite', '/download']) assert.equal((await call(`/themes/${id}${path}`)).status, 404);
  const rejectedReceipt = (await dataOf(await call(`/submissions/${id}`, { headers: { Authorization: `Bearer ${receiptToken}` } }))).data.submission;
  assert.equal(rejectedReceipt.reason, '本地验证已结束。');
  assert.deepEqual((await dataOf(await call('/themes'))).data.themes, []);
  console.log('PASS: reports persist, rejection needs a reason, and withdrawn themes lose all public access.');

  const large = await call('/submissions', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=test', 'Content-Length': String(12 * 1024 * 1024) }, body: 'small' });
  assert.equal(large.status, 413);
  const streamed = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(11 * 1024 * 1024 + 1)); controller.close(); } });
  assert.equal((await call('/submissions', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=test' }, body: streamed, duplex: 'half' })).status, 413);
  const rowCount = database.prepare('SELECT count(*) AS count FROM submissions').get().count;
  const invalid = submission();
  invalid.set('sprite', new Blob(['<svg onload="alert(1)"></svg>'], { type: 'image/png' }), 'pretend.png');
  assert.equal((await call('/submissions', { method: 'POST', body: invalid })).status, 400);
  assert.equal(database.prepare('SELECT count(*) AS count FROM submissions').get().count, rowCount);
  assert.equal(objects.size, 2, 'Invalid submissions must not persist image objects');
  assert.equal((await call('/submissions', { method: 'POST', body: submission() })).status, 201);
  const limited = await call('/submissions', { method: 'POST', body: submission() });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Cache-Control'), 'no-store');
  console.log('PASS: declared and streamed upload caps, disguised SVG rejection before persistence, and atomic per-IP daily rate limits.');

  const rollbackObjects = new Map();
  const quotaBeforeFailure = quota();
  const failedAssets = {
    ...THEME_ASSETS,
    async put(key, value) {
      if (key.endsWith('/sprite')) throw new Error('Simulated storage failure');
      await new Promise(resolve => setTimeout(resolve, 5));
      rollbackObjects.set(key, value);
    },
    async delete(key) { assert.equal(typeof key, 'string'); rollbackObjects.delete(key); },
  };
  const failed = await call('/submissions', { method: 'POST', headers: { 'CF-Connecting-IP': '198.51.100.9' }, body: submission() }, { ...env, THEME_ASSETS: failedAssets });
  assert.equal(failed.status, 500);
  assert.equal(rollbackObjects.size, 0, 'Concurrent failed writes must settle before rollback');
  assert.equal(quota(), quotaBeforeFailure, 'Failed writes release their storage reservation after cleanup');
  assert.equal(database.prepare('SELECT count(*) AS count FROM submissions').get().count, rowCount + 1);
  const failedData = await failed.json();
  assert.equal(JSON.stringify(failedData).includes('Simulated'), false, 'Storage details must not leak to callers');
  const day = new Date().toISOString().slice(0, 10);
  database.prepare('UPDATE limits SET count = 200, window_start = ? WHERE key = ?').run(day, 'submission:global');
  const globalLimit = await call('/submissions', { method: 'POST', headers: { 'CF-Connecting-IP': '198.51.100.10' }, body: submission() });
  assert.equal(globalLimit.status, 429);
  assert.equal(database.prepare('SELECT count(*) AS count FROM submissions').get().count, rowCount + 1);
  assert.equal((await call('/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ' '.repeat(8193) })).status, 413);
  console.log('PASS: concurrent storage failure rolls back, internal errors stay private, global submission cap and JSON size cap work.');

  const duplicate = database.prepare(`INSERT INTO submissions
    (id, title, author, description, provenance, license, config_json, background_type, background_size, sprite_size, receipt_hash, status, created_at, published_at)
    SELECT ?, title, author, description, provenance, license, config_json, background_type, background_size, sprite_size, receipt_hash, ?, created_at, ?
    FROM submissions WHERE id = ?`);
  for (let index = 0; index < 55; index++) {
    duplicate.run(crypto.randomUUID(), 'approved', new Date(Date.now() + index).toISOString(), id);
    duplicate.run(crypto.randomUUID(), 'pending', null, id);
  }
  const firstPage = (await dataOf(await call('/themes'))).data;
  const secondPage = (await dataOf(await call(`/themes?offset=${firstPage.nextOffset}`))).data;
  assert.equal(firstPage.themes.length, 48);
  assert.equal(firstPage.hasMore, true);
  assert.equal(firstPage.nextOffset, 48);
  assert.equal(secondPage.themes.length, 7);
  assert.equal(secondPage.hasMore, false);
  assert.equal(secondPage.nextOffset, null);
  assert.equal(new Set([...firstPage.themes, ...secondPage.themes].map(item => item.id)).size, 55);
  const pendingFirst = (await dataOf(await call('/moderation?status=pending', { headers: adminHeaders }))).data;
  const pendingSecond = (await dataOf(await call(`/moderation?status=pending&offset=${pendingFirst.nextOffset}`, { headers: adminHeaders }))).data;
  assert.equal(pendingFirst.submissions.length, 48);
  assert.equal(pendingSecond.submissions.length, 8);
  assert.equal(pendingSecond.hasMore, false);
  assert.equal(new Set([...pendingFirst.submissions, ...pendingSecond.submissions].map(item => item.id)).size, 56);
  for (const offset of ['-1', '1.5', '100001', 'x']) {
    assert.equal((await call('/themes?offset=' + offset)).status, 400);
    assert.equal((await call('/moderation?offset=' + offset, { headers: adminHeaders })).status, 400);
  }
  console.log('PASS: public and moderation pagination reaches older themes without duplicates; malformed offsets are rejected.');

  database.prepare('UPDATE limits SET count = 0 WHERE key = ?').run('submission:global');
  const fullBytes = 900 * 1024 * 1024;
  database.prepare('UPDATE storage_quota SET bytes = ? WHERE id = 1').run(fullBytes - imageBytes + 1);
  const objectsBeforeFull = objects.size;
  const full = await call('/submissions', { method: 'POST', headers: { 'CF-Connecting-IP': '198.51.100.20' }, body: submission() });
  assert.equal(full.status, 503);
  assert.equal((await full.json()).error.code, 'storage_full');
  assert.equal(objects.size, objectsBeforeFull, 'Capacity rejection must happen before any KV writes');
  assert.equal(quota(), fullBytes - imageBytes + 1);
  database.prepare('UPDATE storage_quota SET bytes = ? WHERE id = 1').run(fullBytes - imageBytes);
  const exactFull = await call('/submissions', { method: 'POST', headers: { 'CF-Connecting-IP': '198.51.100.21' }, body: submission() });
  assert.equal(exactFull.status, 201);
  assert.equal(quota(), fullBytes, 'A submission fitting the exact storage boundary is accepted');
  database.exec(await readFile(new URL('../workshop/schema.sql', import.meta.url), 'utf8'));
  assert.equal(quota(), fullBytes, 'Reapplying schema must preserve reservations');

  database.prepare('UPDATE storage_quota SET bytes = 0 WHERE id = 1').run();
  const failedInsertEnv = { ...env, DB: { prepare(sql) {
    if (/^INSERT INTO submissions/.test(sql)) return { bind() { return this; }, async run() { throw new Error('Simulated insert failure'); } };
    return DB.prepare(sql);
  } } };
  const beforeInsertFailure = objects.size;
  const insertFailure = await call('/submissions', { method: 'POST', headers: { 'CF-Connecting-IP': '198.51.100.22' }, body: submission() }, failedInsertEnv);
  assert.equal(insertFailure.status, 500);
  assert.equal(quota(), 0);
  assert.equal(objects.size, beforeInsertFailure, 'Failed D1 insert must clean both KV keys');
  const cleanupFailureAssets = { ...failedAssets, async delete() { throw new Error('Simulated cleanup failure'); } };
  const cleanupFailure = await call('/submissions', { method: 'POST', headers: { 'CF-Connecting-IP': '198.51.100.23' }, body: submission() }, { ...env, THEME_ASSETS: cleanupFailureAssets });
  assert.equal(cleanupFailure.status, 500);
  assert.equal(quota(), imageBytes, 'Failed cleanup keeps a conservative reservation for possible orphaned KV data');
  console.log('PASS: atomic 900 MiB storage capacity, exact boundary, idempotent schema, rollback and conservative failed-cleanup accounting.');
} finally {
  database.close();
}
