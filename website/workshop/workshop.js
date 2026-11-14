import {createPreview} from './preview.js';

const api = '/api/workshop';
const main = document.querySelector('#main');
const params = new URLSearchParams(location.search);
const receiptKey = 'wherefile-workshop-receipts-v1';
const cleanup = [];
const statuses = {pending: '等待审核', approved: '已发布', rejected: '未通过审核'};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function showTemplate(id) { main.replaceChildren(document.querySelector(`#${id}-template`).content.cloneNode(true)); }
function status(node, message = '', error = false) { node.textContent = message; node.classList.toggle('is-error', error); }
function safeURL(value) {
  const url = new URL(value, location.origin);
  if (url.origin !== location.origin || !url.pathname.startsWith(`${api}/`)) throw new Error('主题资源地址无效。');
  return url.href;
}
async function request(path, options = {}) {
  let response;
  try { response = await fetch(`${api}${path}`, {...options, credentials: 'same-origin'}); }
  catch { throw new Error('暂时无法连接创意工坊，请稍后重试。'); }
  let result;
  try { result = await response.json(); } catch { /* A platform error may not contain JSON. */ }
  if (!response.ok) {
    const error = new Error(result?.error?.message || (response.status === 413 ? '图片太大，请缩小图片后重试。' : '暂时无法完成请求，请稍后重试。'));
    error.status = response.status;
    throw error;
  }
  if (!result) throw new Error('暂时无法读取工坊数据，请稍后重试。');
  return result;
}
function dateText(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleDateString('zh-CN', {year: 'numeric', month: 'long', day: 'numeric'});
}
function receipts() {
  try { return JSON.parse(localStorage.getItem(receiptKey) || '[]').filter(item => uuid.test(item.id) && typeof item.token === 'string'); }
  catch { return []; }
}
function saveReceipt(submission, token) {
  try { localStorage.setItem(receiptKey, JSON.stringify([{id: submission.id, token, title: submission.title}, ...receipts().filter(item => item.id !== submission.id)].slice(0, 10))); }
  catch { /* The receipt link remains available when browser storage is disabled. */ }
}
function receiptURL(id, token) { return `${location.origin}/workshop/?submission=${encodeURIComponent(id)}#receipt=${encodeURIComponent(token)}`; }
function connectPreview(container, options, button) {
  button.hidden = false;
  function sync(paused) {
    button.textContent = paused ? '播放预览' : '暂停预览';
    button.setAttribute('aria-pressed', String(paused));
  }
  const preview = createPreview(container, {...options, onPauseChange: sync});
  sync(preview.paused);
  button.onclick = () => sync(preview.setPaused(!preview.paused));
  cleanup.push(() => { preview.destroy(); button.onclick = null; });
  return preview;
}
function showError(error) {
  const box = element('section', 'page-error');
  box.append(element('h1', '', '暂时无法打开'), element('p', '', error.message));
  const retry = element('button', 'secondary-button', '重试');
  retry.addEventListener('click', () => location.reload());
  const back = element('a', 'back-link', '返回工坊');
  back.href = '/workshop/';
  box.append(retry, element('br'), back);
  main.replaceChildren(box);
}

async function gallery() {
  showTemplate('gallery');
  const recent = receipts();
  if (recent.length) {
    const list = element('details', 'recent-submissions');
    list.append(element('summary', '', '查看我最近的提交'));
    recent.forEach(item => {
      const link = element('a', '', item.title || '我的主题');
      link.href = receiptURL(item.id, item.token);
      list.append(link);
    });
    document.querySelector('#recent-submissions').append(list);
  }
  const galleryStatus = document.querySelector('#gallery-status');
  const grid = document.querySelector('#theme-gallery');
  const more = element('button', 'secondary-button pagination-button', '加载更多');
  more.type = 'button';
  more.hidden = true;
  grid.after(more);
  let nextOffset = 0;
  async function load() {
    more.disabled = true;
    try {
    const {themes, hasMore, nextOffset: next} = await request(`/themes?offset=${nextOffset}`);
    galleryStatus.hidden = true;
    if (!themes.length && nextOffset === 0) {
      grid.classList.remove('theme-gallery');
      grid.classList.add('empty-gallery');
      grid.append(element('p', '', '第一片社区风景，等你来分享。'));
      const link = element('a', 'secondary-button', '上传主题');
      link.href = '?submit';
      grid.append(link);
      return;
    }
    themes.forEach(theme => {
      const link = element('a', 'gallery-card');
      link.href = `?theme=${encodeURIComponent(theme.id)}`;
      const cover = element('div', 'gallery-cover');
      const image = element('img');
      image.src = safeURL(theme.assets.background);
      image.alt = theme.title;
      image.loading = 'lazy';
      cover.append(image);
      link.append(cover, element('h3', '', theme.title), element('p', '', `作者：${theme.author}`));
      grid.append(link);
    });
    nextOffset = next;
    more.hidden = !hasMore;
  } catch (error) {
    galleryStatus.hidden = false;
    galleryStatus.textContent = error.message;
    const retry = element('button', 'text-button', '重新读取');
    retry.addEventListener('click', load);
    galleryStatus.append(element('br'), retry);
  } finally { more.disabled = false; }
  }
  more.addEventListener('click', load);
  await load();
}

async function readImage(file, sprite) {
  if (!file) return null;
  const max = (sprite ? 2 : 8) * 1024 * 1024;
  if (file.size > max) throw new Error(`${sprite ? '透明物件' : '背景图片'}不能超过 ${sprite ? 2 : 8} MB。`);
  if (!(sprite ? ['image/png'] : ['image/png', 'image/jpeg', 'image/webp']).includes(file.type)) throw new Error(sprite ? '透明物件请选择 PNG 图片。' : '背景请选择 PNG、JPG 或 WebP 图片。');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const limit = sprite ? 2048 : 4096;
    if (width > limit || height > limit || width < (sprite ? 32 : 640) || height < (sprite ? 32 : 360)) throw new Error(sprite ? '透明物件的宽和高需在 32–2048 像素之间。' : '背景至少需要 640 × 360 像素，最长边不能超过 4096。');
    if (sprite) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', {willReadFrequently: true});
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, width, height).data;
      let transparent = false;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 255) { transparent = true; break; }
      canvas.width = canvas.height = 0;
      if (!transparent) throw new Error('物件图片需要透明背景，请先去除图片底色。');
    }
    return {url, file};
  } catch (error) {
    URL.revokeObjectURL(url);
    throw new Error(error.name === 'EncodingError' ? '无法读取这张图片，请换一张图片。' : error.message);
  }
}

function submitTheme() {
  showTemplate('submit');
  document.title = '上传主题 — WhereFile 创意工坊';
  const form = document.querySelector('#theme-form');
  const formStatus = document.querySelector('#form-status');
  const button = form.querySelector('[type=submit]');
  const images = {background: null, sprite: null};
  const fileVersions = {background: 0, sprite: 0};
  let preview;
  let submitting = false;
  let validating = 0;
  cleanup.push(() => Object.values(images).forEach(image => image && URL.revokeObjectURL(image.url)));
  function config() {
    const region = ['left', 'top', 'right', 'bottom'].map(side => Number(document.querySelector(`#region-${side}`).value) / 100);
    if (region.some(value => !Number.isFinite(value) || value < 0 || value > 1) || region[2] - region[0] + 1e-9 < .15 || region[3] - region[1] + 1e-9 < .15) throw new Error('活动范围的宽和高至少需要 15%，右侧和底部要大于左侧和顶部。');
    return {schema_version: 1, renderer: 'static', region, object_scale: Number(document.querySelector('#object-scale').value) / 100, motion: document.querySelector('#motion').value, duration: Number(document.querySelector('#duration').value), forward_degrees: Number(document.querySelector('#forward').value)};
  }
  function refreshPreview() {
    document.querySelector('#scale-value').value = `${document.querySelector('#object-scale').value}%`;
    document.querySelector('#duration-value').value = `${document.querySelector('#duration').value} 秒`;
    document.querySelector('#forward-field').hidden = document.querySelector('#motion').value !== 'heading';
    try {
      const next = {config: config(), background: images.background?.url || '', sprite: images.sprite?.url || '', showRegion: document.querySelector('#show-region').checked};
      if (!images.background) {
        preview?.destroy();
        preview = null;
        const stage = document.querySelector('#upload-preview');
        stage.replaceChildren(element('p', 'stage-placeholder', '选择图片后，在这里预览。'));
        stage.style.aspectRatio = '';
        document.querySelector('#preview-pause').hidden = true;
        return;
      }
      if (!preview) preview = connectPreview(document.querySelector('#upload-preview'), next, document.querySelector('#preview-pause'));
      else preview.update(next);
    } catch (error) { status(formStatus, error.message, true); }
  }
  for (const kind of ['background', 'sprite']) {
    const input = document.querySelector(`#${kind}`);
    input.addEventListener('change', async () => {
      const version = ++fileVersions[kind];
      validating++;
      button.disabled = true;
      status(formStatus);
      try {
        const image = await readImage(input.files[0], kind === 'sprite');
        if (version !== fileVersions[kind]) { if (image) URL.revokeObjectURL(image.url); return; }
        if (images[kind]) URL.revokeObjectURL(images[kind].url);
        images[kind] = image;
        refreshPreview();
      } catch (error) {
        if (version !== fileVersions[kind]) return;
        input.value = '';
        if (images[kind]) URL.revokeObjectURL(images[kind].url);
        images[kind] = null;
        refreshPreview();
        status(formStatus, error.message, true);
      } finally { validating--; button.disabled = submitting || validating > 0; }
    });
  }
  form.addEventListener('input', event => { if (!['file', 'text', 'textarea', 'checkbox'].includes(event.target.type) || event.target.id === 'show-region') refreshPreview(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || validating || !form.reportValidity()) return;
    try {
      if (!images.background || !images.sprite) throw new Error('请选择有效的背景图片和透明物件。');
      const settings = config();
      submitting = true;
      button.disabled = true;
      button.textContent = '正在提交…';
      status(formStatus, '正在上传图片，请保持页面打开。');
      const data = new FormData();
      for (const field of ['title', 'author', 'description', 'provenance']) data.append(field, form.elements[field].value.trim());
      data.append('rightsAccepted', 'true');
      data.append('license', 'personal-use');
      data.append('config', JSON.stringify(settings));
      data.append('background', images.background.file);
      data.append('sprite', images.sprite.file);
      const {submission, receiptToken} = await request('/submissions', {method: 'POST', body: data});
      saveReceipt(submission, receiptToken);
      location.href = receiptURL(submission.id, receiptToken);
    } catch (error) {
      status(formStatus, error.message, true);
      submitting = false;
      button.disabled = false;
      button.textContent = '提交审核';
    }
  });
}

async function detail(id) {
  if (!uuid.test(id)) throw new Error('没有找到这个主题。');
  const {theme} = await request(`/themes/${id}`);
  showTemplate('detail');
  document.title = `${theme.title} — WhereFile 创意工坊`;
  document.querySelector('#theme-title').textContent = theme.title;
  document.querySelector('#theme-credit').textContent = `作者：${theme.author}${theme.publishedAt ? `　${dateText(theme.publishedAt)}` : ''}`;
  document.querySelector('#theme-description').textContent = theme.description;
  document.querySelector('#theme-description').hidden = !theme.description;
  document.querySelector('#theme-provenance').textContent = theme.provenance;
  document.querySelector('#theme-download').href = safeURL(theme.downloadUrl);
  connectPreview(document.querySelector('#detail-preview'), {config: theme.config, background: safeURL(theme.assets.background), sprite: safeURL(theme.assets.sprite)}, document.querySelector('#preview-pause'));
  const reportForm = document.querySelector('#report-form');
  reportForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = reportForm.querySelector('button');
    button.disabled = true;
    const reportStatus = document.querySelector('#report-status');
    try {
      await request('/reports', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({themeId: id, reason: reportForm.elements.reason.value.trim(), contact: reportForm.elements.contact.value.trim()})});
      reportForm.reset();
      status(reportStatus, '反馈已发送，管理员会查看处理。');
    } catch (error) { status(reportStatus, error.message, true); }
    finally { button.disabled = false; }
  });
}

async function receipt(id) {
  if (!uuid.test(id)) throw new Error('提交记录地址无效。');
  showTemplate('receipt');
  const token = new URLSearchParams(location.hash.slice(1)).get('receipt') || receipts().find(item => item.id === id)?.token;
  const receiptStatus = document.querySelector('#receipt-status');
  const refresh = document.querySelector('#refresh-receipt');
  if (!token) {
    receiptStatus.textContent = '缺少查询凭证，请使用提交后保存的完整查询链接。';
    refresh.hidden = true;
    return;
  }
  document.querySelector('#receipt-recovery').hidden = false;
  const input = document.querySelector('#receipt-url');
  input.value = receiptURL(id, token);
  document.querySelector('#copy-receipt').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(input.value); document.querySelector('#receipt-message').textContent = '查询链接已复制。'; }
    catch { input.select(); document.querySelector('#receipt-message').textContent = '请复制上方完整链接。'; }
  });
  async function load() {
    refresh.disabled = true;
    try {
      const {submission} = await request(`/submissions/${id}`, {headers: {Authorization: `Bearer ${token}`}});
      saveReceipt(submission, token);
      document.querySelector('#receipt-title').textContent = submission.title;
      receiptStatus.textContent = submission.status === 'pending' ? '已收到你的主题，正在等待审核。通过后会在工坊公开。' : submission.status === 'approved' ? '主题已发布，大家现在可以预览和下载了。' : '这次提交未通过审核。你可以根据下面的原因调整素材，再提交一次。';
      const reason = document.querySelector('#receipt-reason');
      reason.hidden = !submission.reason;
      reason.textContent = submission.reason || '';
      const link = document.querySelector('#published-link');
      link.hidden = submission.status !== 'approved';
      if (!link.hidden) link.href = `?theme=${encodeURIComponent(submission.publishedThemeId || id)}`;
    } catch (error) { receiptStatus.textContent = error.message; }
    finally { refresh.disabled = false; }
  }
  refresh.addEventListener('click', load);
  await load();
}

function review() {
  showTemplate('review');
  document.title = '主题审核 — WhereFile';
  const login = document.querySelector('#review-login');
  const workspace = document.querySelector('#review-workspace');
  const reviewStatus = document.querySelector('#review-status');
  const list = document.querySelector('#review-list');
  const panel = document.querySelector('#review-detail');
  const statsStatus = document.querySelector('#stats-status');
  const statsContent = document.querySelector('#stats-content');
  const statsSummary = document.querySelector('#stats-summary');
  const statsDownloads = document.querySelector('#stats-downloads');
  const statsRefresh = document.querySelector('#stats-refresh');
  let token = '';
  let preview;
  let imageURLs = [];
  let selected = null;
  let detailVersion = 0;
  let listVersion = 0;
  let statsVersion = 0;
  let nextOffset = 0;
  const more = element('button', 'secondary-button pagination-button', '加载更多');
  more.type = 'button';
  more.hidden = true;
  const listColumn = element('div');
  list.before(listColumn);
  listColumn.append(list, more);
  const headers = () => ({Authorization: `Bearer ${token}`});
  function clearPreview() {
    preview?.destroy();
    preview = null;
    imageURLs.forEach(url => URL.revokeObjectURL(url));
    imageURLs = [];
  }
  cleanup.push(clearPreview);
  function logout() {
    token = '';
    selected = null;
    detailVersion++;
    listVersion++;
    statsVersion++;
    clearPreview();
    list.replaceChildren();
    panel.replaceChildren();
    statsSummary.replaceChildren();
    statsDownloads.replaceChildren();
    statsContent.hidden = true;
    status(statsStatus);
    statsRefresh.disabled = false;
    more.hidden = true;
    workspace.hidden = true;
    login.hidden = false;
    status(reviewStatus);
  }
  async function reviewRequest(path, options = {}) {
    try { return await request(path, {...options, headers: {...headers(), ...options.headers}}); }
    catch (error) { if (error.status === 401) { logout(); status(reviewStatus, error.message, true); } throw error; }
  }
  async function loadStats() {
    const version = ++statsVersion;
    statsRefresh.disabled = true;
    statsContent.hidden = true;
    status(statsStatus, '正在读取下载统计…');
    try {
      const data = await reviewRequest('/moderation/stats');
      if (version !== statsVersion) return;
      const row = (title, counts) => {
        const tr = element('tr');
        const label = element('th', '', title);
        label.scope = 'row';
        tr.append(label);
        for (const key of ['total', 'today', 'last7Days']) tr.append(element('td', '', Number(counts[key] || 0).toLocaleString('zh-CN')));
        return tr;
      };
      statsSummary.replaceChildren(row('Windows 安装包', data.summary.installer), row('主题包', data.summary.theme));
      statsDownloads.replaceChildren(...data.downloads.map(item => row(item.title, item)));
      statsContent.hidden = false;
      document.querySelector('.stats-breakdown').hidden = !data.downloads.length;
      status(statsStatus, data.summary.installer.total + data.summary.theme.total === 0 ? '还没有下载记录，数据从功能上线后开始累计。' : '');
    } catch (error) { if (version === statsVersion) status(statsStatus, error.message, true); }
    finally { if (version === statsVersion) statsRefresh.disabled = false; }
  }
  statsRefresh.addEventListener('click', loadStats);
  async function loadList(append = false) {
    const version = ++listVersion;
    more.disabled = true;
    try {
    const {submissions, hasMore, nextOffset: next} = await reviewRequest(`/moderation?status=${encodeURIComponent(document.querySelector('#review-filter').value)}&offset=${append ? nextOffset : 0}`);
    if (version !== listVersion) return;
    if (!append) list.replaceChildren();
    if (!submissions.length && !append) list.append(element('p', 'review-empty', '这个状态下还没有主题。'));
    submissions.forEach(item => {
      const button = element('button', 'review-item');
      button.type = 'button';
      button.dataset.id = item.id;
      button.append(element('strong', '', item.title), element('span', '', `${item.author}　${dateText(item.createdAt)}`));
      button.setAttribute('aria-pressed', String(item.id === selected));
      button.addEventListener('click', () => showSubmission(item.id).catch(error => status(reviewStatus, error.message, true)));
      list.append(button);
    });
    nextOffset = next;
    more.hidden = !hasMore;
    if (!append && selected && !submissions.some(item => item.id === selected)) {
      selected = null;
      detailVersion++;
      clearPreview();
      panel.replaceChildren();
    }
    } finally { if (version === listVersion) more.disabled = false; }
  }
  more.addEventListener('click', () => loadList(true).catch(error => status(reviewStatus, error.message, true)));
  async function showSubmission(id) {
    const version = ++detailVersion;
    status(reviewStatus);
    clearPreview();
    selected = id;
    list.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.id === id)));
    panel.replaceChildren(element('p', 'muted', '正在读取主题…'));
    const {submission} = await reviewRequest(`/moderation/${id}`);
    if (version !== detailVersion) return;
    const newURLs = [];
    try {
      for (const kind of ['background', 'sprite']) {
        const response = await fetch(safeURL(submission.assets[kind]), {headers: headers(), credentials: 'same-origin'});
        if (response.status === 401) logout();
        if (!response.ok) throw new Error('无法读取待审核图片。');
        newURLs.push(URL.createObjectURL(await response.blob()));
      }
      if (version !== detailVersion) { newURLs.forEach(url => URL.revokeObjectURL(url)); return; }
      imageURLs = newURLs;
    } catch (error) { newURLs.forEach(url => URL.revokeObjectURL(url)); throw error; }
    panel.replaceChildren();
    panel.append(element('h2', '', submission.title), element('p', 'muted', `作者：${submission.author}　${statuses[submission.status] || submission.status}`));
    if (submission.description) panel.append(element('p', '', submission.description));
    const pause = element('button', 'text-button', '暂停预览');
    pause.type = 'button';
    panel.append(pause);
    const stage = element('div', 'theme-stage');
    panel.append(stage);
    preview = connectPreview(stage, {config: submission.config, background: imageURLs[0], sprite: imageURLs[1]}, pause);
    const facts = element('dl', 'theme-facts');
    const source = element('div');
    source.append(element('dt', '', '素材来源'), element('dd', '', submission.provenance));
    facts.append(source);
    panel.append(facts);
    const field = element('div', 'field');
    const label = element('label', '', '未通过原因 / 撤下原因');
    label.htmlFor = 'review-reason';
    const reason = element('textarea');
    reason.id = 'review-reason';
    reason.maxLength = 600;
    reason.rows = 3;
    reason.value = submission.reason || '';
    field.append(label, reason);
    panel.append(field);
    const actions = element('div', 'review-actions');
    const approve = element('button', 'button', submission.status === 'approved' ? '已发布' : '审核通过并发布');
    approve.type = 'button';
    approve.disabled = submission.status === 'approved';
    const reject = element('button', 'secondary-button', submission.status === 'approved' ? '撤下主题' : '不通过');
    reject.type = 'button';
    actions.append(approve, reject);
    panel.append(actions);
    async function moderate(nextStatus) {
      if (nextStatus === 'rejected' && !reason.value.trim()) { status(reviewStatus, '请填写未通过或撤下的原因。', true); reason.focus(); return; }
      approve.disabled = reject.disabled = true;
      try {
        await reviewRequest(`/moderation/${id}`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({status: nextStatus, reason: reason.value.trim()})});
        status(reviewStatus, nextStatus === 'approved' ? '主题已发布。' : '主题已撤下或标记为未通过。');
        await loadList();
      } catch (error) { status(reviewStatus, error.message, true); approve.disabled = submission.status === 'approved'; reject.disabled = false; }
    }
    approve.addEventListener('click', () => moderate('approved'));
    reject.addEventListener('click', () => moderate('rejected'));
  }
  login.addEventListener('submit', async event => {
    event.preventDefault();
    token = document.querySelector('#review-token').value.trim();
    login.querySelector('button').disabled = true;
    try {
      await loadList();
      login.hidden = true;
      workspace.hidden = false;
      document.querySelector('#review-token').value = '';
      status(reviewStatus);
      loadStats();
    } catch (error) { token = ''; status(reviewStatus, error.message, true); }
    finally { login.querySelector('button').disabled = false; }
  });
  for (const [id, event] of [['review-filter', 'change'], ['review-refresh', 'click']]) document.querySelector(`#${id}`).addEventListener(event, () => loadList().catch(error => status(reviewStatus, error.message, true)));
  document.querySelector('#review-logout').addEventListener('click', logout);
}

window.addEventListener('pagehide', event => { if (!event.persisted) cleanup.forEach(fn => fn()); });
try {
  if (params.has('review')) review();
  else if (params.has('submit')) submitTheme();
  else if (params.has('submission')) await receipt(params.get('submission'));
  else if (params.has('theme')) await detail(params.get('theme'));
  else await gallery();
} catch (error) { showError(error); }
