import { validateSubmission } from './validation.mjs';
import { makeZip } from './zip.mjs';

const PREFIX = '/api/workshop';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const MAX_UPLOAD = 11 * 1024 * 1024;
const MAX_STORED_BYTES = 900 * 1024 * 1024;
const encoder = new TextEncoder();
const privateHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

class ApiError extends Error {
  constructor(status, code, message, headers = {}) { super(message); this.status = status; this.code = code; this.headers = headers; }
}

function fail(status, code, message, headers) { throw new ApiError(status, code, message, headers); }
function json(value, status = 200, extra = {}) {
  return new Response(JSON.stringify(value), { status, headers: { ...privateHeaders, 'Content-Type': 'application/json; charset=utf-8', ...extra } });
}
function storage(env) {
  if (!env.DB || !env.THEME_ASSETS) fail(503, 'unavailable', '主题存储尚未连接，请稍后再试。');
}
function writeOrigin(request) {
  const origin = request.headers.get('Origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    fail(403, 'origin_not_allowed', '请从本站提交。');
  }
}
function bearer(request) {
  const match = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(request.headers.get('Authorization') || '');
  if (!match) fail(401, 'authorization_required', '请提供有效的查看凭证。');
  return match[1];
}
async function digest(value) { return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))); }
function hex(bytes) { return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
async function admin(request, env) {
  if (typeof env.WORKSHOP_ADMIN_TOKEN !== 'string' || env.WORKSHOP_ADMIN_TOKEN.length < 32) {
    fail(503, 'moderation_unavailable', '审核服务尚未配置。');
  }
  const token = bearer(request);
  const [actual, expected] = await Promise.all([digest(token), digest(env.WORKSHOP_ADMIN_TOKEN)]);
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= actual[index] ^ expected[index];
  if (difference) fail(401, 'invalid_authorization', '查看凭证无效。');
}
async function limitedBody(request, maximum) {
  const length = request.headers.get('Content-Length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maximum)) fail(413, 'payload_too_large', '提交内容过大，请缩小文件后重试。');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'empty_body', '请填写提交内容。');
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximum) {
      await reader.cancel().catch(() => {});
      fail(413, 'payload_too_large', '提交内容过大，请缩小文件后重试。');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
async function jsonBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) fail(415, 'content_type', '请使用 JSON 格式提交。');
  let data;
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await limitedBody(request, 8192))); }
  catch (error) { if (error instanceof ApiError) throw error; fail(400, 'invalid_json', '提交内容格式有误。'); }
  if (!data || Array.isArray(data) || typeof data !== 'object') fail(400, 'invalid_json', '提交内容格式有误。');
  return data;
}
function text(value, name, minimum, maximum) {
  if (typeof value !== 'string') fail(400, 'invalid_field', `请填写${name}。`);
  const result = value.trim();
  if (result.length < minimum || result.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) {
    fail(400, 'invalid_field', `${name}需要 ${minimum}–${maximum} 个字符。`);
  }
  return result;
}
function pageOffset(url) {
  const value = url.searchParams.get('offset') ?? '0';
  if (!/^\d{1,6}$/.test(value) || Number(value) > 100000) fail(400, 'invalid_offset', '翻页位置无效，请从第一页重新打开。');
  return Number(value);
}
async function rateLimit(request, env, action) {
  if (typeof env.WORKSHOP_RATE_SALT !== 'string' || env.WORKSHOP_RATE_SALT.length < 16) fail(503, 'upload_unavailable', '提交服务尚未配置，请稍后再试。');
  const day = new Date().toISOString().slice(0, 10);
  const ipHash = hex(await digest(`${env.WORKSHOP_RATE_SALT}:${request.headers.get('CF-Connecting-IP') || 'local'}`));
  const maximum = action === 'submission' ? 5 : 20;
  const consume = key => env.DB.prepare(`INSERT INTO limits (key, window_start, count) VALUES (?, ?, 1)
    ON CONFLICT(key) DO UPDATE SET count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END,
    window_start = excluded.window_start RETURNING count`).bind(key, day).first();
  const own = await consume(`${action}:${ipHash}`);
  if (!own || own.count > maximum) fail(429, 'rate_limited', action === 'submission' ? '今天提交的主题已达上限，请明天再来。' : '今天提交的反馈已达上限，请明天再来。');
  if (action === 'submission') {
    const global = await consume('submission:global');
    if (!global || global.count > 200) fail(429, 'rate_limited', '今天的主题投稿已满，请明天再来。');
  }
}
function summary(row) {
  return {
    id: row.id, title: row.title, status: row.status, createdAt: row.created_at,
    ...(row.status === 'rejected' ? { reason: row.rejection_reason } : {}),
    ...(row.status === 'approved' ? { publishedThemeId: row.id } : {}),
  };
}
function theme(row, isPrivate = false) {
  const assetBase = isPrivate ? `${PREFIX}/moderation/${row.id}/assets` : `${PREFIX}/themes/${row.id}/assets`;
  return {
    id: row.id, title: row.title, author: row.author, description: row.description,
    provenance: row.provenance, license: row.license, createdAt: row.created_at,
    publishedAt: row.published_at, config: JSON.parse(row.config_json),
    assets: { background: `${assetBase}/background`, sprite: `${assetBase}/sprite` },
    ...(isPrivate ? { status: row.status, reason: row.rejection_reason, reviewedAt: row.reviewed_at } : { downloadUrl: `${PREFIX}/themes/${row.id}/download` }),
  };
}
async function rowFor(env, id, onlyApproved = false) {
  const row = await env.DB.prepare(`SELECT * FROM submissions WHERE id = ?${onlyApproved ? " AND status = 'approved'" : ''}`).bind(id).first();
  if (!row) fail(404, 'not_found', '没有找到这个主题。');
  return row;
}
async function readAsset(env, row, key) {
  let buffer;
  try { buffer = await env.THEME_ASSETS.get(`${row.id}/${key}`, { type: 'arrayBuffer' }); }
  catch { fail(503, 'storage_unavailable', '素材暂时无法读取，请稍后重试。', { 'Retry-After': '60' }); }
  const size = key === 'sprite' ? row.sprite_size : row.background_size;
  if (!buffer || buffer.byteLength !== size) fail(503, 'assets_syncing', '素材仍在同步，请稍后重试。', { 'Retry-After': '60' });
  return new Uint8Array(buffer);
}
async function asset(request, env, row, key, isPrivate = false) {
  const bytes = await readAsset(env, row, key);
  return new Response(request.method === 'HEAD' ? null : bytes, { headers: {
    ...privateHeaders,
    'Content-Type': key === 'sprite' ? 'image/png' : row.background_type,
    'Content-Length': String(bytes.byteLength),
    'Cache-Control': isPrivate ? 'no-store' : 'public, max-age=60',
  } });
}
async function download(request, env, row) {
  const config = JSON.parse(row.config_json);
  const [background, sprite] = await Promise.all([readAsset(env, row, 'background'), readAsset(env, row, 'sprite')]);
  const readme = `${row.title}\n作者：${row.author}\n\n${row.description}\n\n素材来源与授权说明：\n${row.provenance}\n\n使用范围：个人非商业使用。再分发、修改发布和商用须另行取得作者及相关权利人的授权。\n\n这是 WhereFile 创意工坊主题素材包，包含静态背景、透明物件和运动设置。\n当前 Windows 版尚不支持导入主题包；请在官网预览，或保存素材供个人使用。\n文件不包含可执行程序。\n`;
  const zip = await makeZip([
    { name: 'theme.json', bytes: encoder.encode(JSON.stringify(config, null, 2) + '\n') },
    { name: config.background, bytes: background },
    { name: 'object.png', bytes: sprite },
    { name: 'README.txt', bytes: encoder.encode(readme) },
  ]);
  return new Response(request.method === 'HEAD' ? null : zip, { headers: {
    ...privateHeaders, 'Content-Type': 'application/zip', 'Content-Length': String(zip.byteLength),
    'Content-Disposition': `attachment; filename="WhereFile-theme-${row.id}.zip"`,
  } });
}
async function submit(request, env) {
  if (typeof env.WORKSHOP_ADMIN_TOKEN !== 'string' || env.WORKSHOP_ADMIN_TOKEN.length < 32) fail(503, 'upload_unavailable', '投稿审核尚未配置，请稍后再试。');
  if (!/^multipart\/form-data\s*;/i.test(request.headers.get('Content-Type') || '')) fail(415, 'content_type', '请使用上传表单提交主题。');
  await rateLimit(request, env, 'submission');
  let form;
  try {
    const bytes = await limitedBody(request, MAX_UPLOAD);
    form = await new Request(request.url, { method: 'POST', headers: { 'Content-Type': request.headers.get('Content-Type') }, body: bytes }).formData();
  } catch (error) { if (error instanceof ApiError) throw error; fail(400, 'invalid_form', '上传表单有误，请重新选择素材。'); }
  const data = await validateSubmission(form);
  const id = crypto.randomUUID();
  const receiptToken = hex(crypto.getRandomValues(new Uint8Array(32)));
  const createdAt = new Date().toISOString();
  const storedBytes = data.background.bytes.byteLength + data.sprite.bytes.byteLength;
  const reservation = await env.DB.prepare('UPDATE storage_quota SET bytes = bytes + ? WHERE id = 1 AND bytes + ? <= ? RETURNING bytes')
    .bind(storedBytes, storedBytes, MAX_STORED_BYTES).first();
  if (!reservation) fail(503, 'storage_full', '工坊存储空间已满，暂时无法接收新主题。');
  try {
    const uploads = await Promise.allSettled([
      env.THEME_ASSETS.put(`${id}/background`, data.background.bytes),
      env.THEME_ASSETS.put(`${id}/sprite`, data.sprite.bytes),
    ]);
    const failed = uploads.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    await env.DB.prepare(`INSERT INTO submissions
      (id, title, author, description, provenance, license, config_json, background_type, background_size, sprite_size, receipt_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, data.title, data.author, data.description, data.provenance,
      data.license, JSON.stringify(data.config), data.background.contentType, data.background.bytes.byteLength,
      data.sprite.bytes.byteLength, hex(await digest(receiptToken)), createdAt).run();
  } catch (error) {
    const cleanup = await Promise.allSettled([env.THEME_ASSETS.delete(`${id}/background`), env.THEME_ASSETS.delete(`${id}/sprite`)]);
    if (cleanup.every(result => result.status === 'fulfilled')) {
      await env.DB.prepare('UPDATE storage_quota SET bytes = bytes - ? WHERE id = 1').bind(storedBytes).run();
    }
    throw error;
  }
  return json({ submission: { id, status: 'pending', title: data.title, createdAt }, receiptToken }, 201);
}

export async function handleWorkshop(request, env) {
  try {
    const url = new URL(request.url);
    const route = url.pathname.slice(PREFIX.length).replace(/\/$/, '') || '/';
    if (!url.pathname.startsWith(PREFIX + '/') && url.pathname !== PREFIX) fail(404, 'not_found', '没有找到此页面。');
    if (!['GET', 'HEAD', 'POST'].includes(request.method)) return json({ error: { code: 'method_not_allowed', message: '不支持此操作。' } }, 405, { Allow: 'GET, HEAD, POST' });
    if (request.method === 'POST') writeOrigin(request);

    if (route === '/submissions' && request.method === 'POST') { storage(env); return await submit(request, env); }
    let match = new RegExp(`^/submissions/(${UUID})$`).exec(route);
    if (match && request.method === 'GET') {
      const token = bearer(request);
      storage(env);
      const row = await env.DB.prepare('SELECT * FROM submissions WHERE id = ? AND receipt_hash = ?').bind(match[1], hex(await digest(token))).first();
      if (!row) fail(404, 'not_found', '投稿不存在，或查看凭证无效。');
      return json({ submission: summary(row) });
    }
    if (route === '/moderation' || route.startsWith('/moderation/')) {
      await admin(request, env);
      storage(env);
      if (route === '/moderation' && request.method === 'GET') {
        const status = url.searchParams.get('status') || 'pending';
        if (!['pending', 'approved', 'rejected'].includes(status)) fail(400, 'invalid_status', '请选择有效的审核状态。');
        const offset = pageOffset(url);
        const { results } = await env.DB.prepare('SELECT * FROM submissions WHERE status = ? ORDER BY created_at DESC, id DESC LIMIT 49 OFFSET ?').bind(status, offset).all();
        return json({ submissions: results.slice(0, 48).map(row => theme(row, true)), hasMore: results.length > 48, nextOffset: results.length > 48 ? offset + 48 : null });
      }
      if (route === '/moderation/reports' && request.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT id, theme_id, reason, contact, created_at FROM reports ORDER BY created_at DESC LIMIT 100').all();
        return json({ reports: results.map(row => ({ id: row.id, themeId: row.theme_id, reason: row.reason, contact: row.contact, createdAt: row.created_at })) });
      }
      match = new RegExp(`^/moderation/(${UUID})(?:/assets/(background|sprite))?$`).exec(route);
      if (match) {
        const row = await rowFor(env, match[1]);
        if (match[2] && ['GET', 'HEAD'].includes(request.method)) return await asset(request, env, row, match[2], true);
        if (!match[2] && request.method === 'GET') return json({ submission: theme(row, true) });
        if (!match[2] && request.method === 'POST') {
          const data = await jsonBody(request);
          if (!['approved', 'rejected'].includes(data.status)) fail(400, 'invalid_status', '请选择通过或退回。');
          const reason = data.status === 'rejected' ? text(data.reason, '退回原因', 1, 600) : '';
          if (data.status === 'approved') await Promise.all([readAsset(env, row, 'background'), readAsset(env, row, 'sprite')]);
          const now = new Date().toISOString();
          await env.DB.prepare('UPDATE submissions SET status = ?, rejection_reason = ?, reviewed_at = ?, published_at = ? WHERE id = ?')
            .bind(data.status, reason, now, data.status === 'approved' ? (row.published_at || now) : null, row.id).run();
          return json({ submission: theme(await rowFor(env, row.id), true) });
        }
      }
      fail(404, 'not_found', '没有找到此审核页面。');
    }
    if (route === '/themes' && request.method === 'GET') {
      storage(env);
      const offset = pageOffset(url);
      const { results } = await env.DB.prepare("SELECT * FROM submissions WHERE status = 'approved' ORDER BY published_at DESC, id DESC LIMIT 49 OFFSET ?").bind(offset).all();
      return json({ themes: results.slice(0, 48).map(row => theme(row)), hasMore: results.length > 48, nextOffset: results.length > 48 ? offset + 48 : null });
    }
    match = new RegExp(`^/themes/(${UUID})(?:/(assets/(background|sprite)|download))?$`).exec(route);
    if (match && ['GET', 'HEAD'].includes(request.method)) {
      storage(env);
      const row = await rowFor(env, match[1], true);
      if (match[3]) return await asset(request, env, row, match[3]);
      if (match[2] === 'download') return await download(request, env, row);
      if (request.method === 'GET') return json({ theme: theme(row) });
    }
    if (route === '/reports' && request.method === 'POST') {
      storage(env);
      const data = await jsonBody(request);
      if (typeof data.themeId !== 'string' || !new RegExp(`^${UUID}$`).test(data.themeId)) fail(400, 'invalid_theme', '请选择要反馈的主题。');
      const reason = text(data.reason, '反馈原因', 10, 1000);
      const contact = data.contact === undefined || data.contact === '' ? '' : text(data.contact, '联系方式', 1, 160);
      await rateLimit(request, env, 'report');
      await rowFor(env, data.themeId, true);
      await env.DB.prepare('INSERT INTO reports (id, theme_id, reason, contact, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), data.themeId, reason, contact, new Date().toISOString()).run();
      return json({ ok: true }, 201);
    }
    fail(404, 'not_found', '没有找到此页面。');
  } catch (error) {
    if (error instanceof ApiError) return json({ error: { code: error.code, message: error.message } }, error.status, error.headers);
    if ([400, 413, 415].includes(error?.status)) return json({ error: { code: error.status === 413 ? 'payload_too_large' : 'invalid_submission', message: error.message } }, error.status);
    console.error('Workshop request failed:', error?.name || 'Error');
    return json({ error: { code: 'internal_error', message: '暂时无法完成，请稍后重试。' } }, 500);
  }
}
