const $ = id => document.getElementById(id);
const scene = $('scene'), castle = $('castle'), panel = $('storage-panel'), pasture = $('pasture');
const dialog = $('folder-dialog'), motionMedia = matchMedia('(prefers-reduced-motion: reduce)');
const folders = [];
let drag = null, paused = motionMedia.matches, frameId = 0, lastFrame = 0, time = 0;
let opened = null, imageURL = null, previewRequest = 0, suppressOpenUntil = 0;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const announce = message => { $('status').textContent = message; };

function makeFolder(name, files, example = false) {
  const folder = { id: crypto.randomUUID(), name, files, example, state: 'stored', x: .65, y: .67,
    direction: 1, phase: Math.random() * 18, el: null };
  folders.push(folder);
  return folder;
}
for (const [name, filename, text] of [
  ['工作资料', '本周计划.txt', '本周计划\n\n整理资料，完成手头的工作。\n这是一份可以打开的示例文件。'],
  ['灵感收藏', '灵感便签.txt', '灵感便签\n\n草原上的每一只小羊，都代表一个文件夹。\n把小羊拖回狼堡，就能重新收纳。'],
  ['旅行计划', '周末出游.txt', '周末出游\n\n找一片草地，晒晒太阳。\n带上野餐垫和喜欢的书。'],
]) makeFolder(name, [{ path: filename, file: new File([text], filename, { type: 'text/plain' }) }], true);

function area(folder) {
  const rect = scene.getBoundingClientRect(), mobile = matchMedia('(max-width: 760px)').matches;
  const [left, top, right, bottom] = mobile ? [.15, .52, .9, .9] : [.36, .42, .94, .87];
  const halfW = (folder?.el?.offsetWidth || (mobile ? 74 : 92)) / 2 / rect.width;
  const halfH = (folder?.el?.offsetHeight || (mobile ? 88 : 108)) / 2 / rect.height;
  return { left: Math.min(left + halfW, (left + right) / 2), right: Math.max(right - halfW, (left + right) / 2),
    top: Math.min(top + halfH, (top + bottom) / 2), bottom: Math.max(bottom - halfH, (top + bottom) / 2) };
}
function point(clientX, clientY) {
  const rect = scene.getBoundingClientRect();
  return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
}
function scenePoint(x, y) {
  const rect = scene.getBoundingClientRect();
  return { x: rect.left + x * rect.width, y: rect.top + y * rect.height };
}
function place(folder) {
  if (!folder.el) return;
  folder.el.style.left = `${folder.x * 100}%`;
  folder.el.style.top = `${folder.y * 100}%`;
  folder.el.querySelector('img').style.transform = `scaleX(${folder.direction})`;
}
function fit(folder) {
  const box = area(folder);
  folder.x = clamp(folder.x, box.left, box.right);
  folder.y = clamp(folder.y, box.top, box.bottom);
  place(folder);
}
function folderButton(folder, className) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = className; button.dataset.folderId = folder.id;
  button.setAttribute('aria-label', `${folder.name}，文件夹`);
  button.addEventListener('pointerdown', event => beginPointer(event, folder, button));
  button.addEventListener('dblclick', () => { if (performance.now() >= suppressOpenUntil) openFolder(folder); });
  button.addEventListener('keydown', event => keyControl(event, folder, button));
  return button;
}
function render() {
  $('folder-list').replaceChildren();
  for (const folder of folders) {
    if (folder.state === 'stored') {
      folder.el?.remove(); folder.el = null;
      const button = folderButton(folder, 'folder-entry');
      const icon = document.createElement('span'); icon.className = 'folder-entry-icon'; icon.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span'); name.className = 'folder-name'; name.textContent = folder.name;
      button.append(icon, name); $('folder-list').append(button);
    } else if (!folder.el) {
      const button = folderButton(folder, 'sheep');
      const image = document.createElement('img'); image.src = './assets/sheep.png'; image.alt = ''; image.draggable = false;
      const name = document.createElement('span'); name.className = 'sheep-name'; name.textContent = folder.name;
      button.append(image, name); pasture.append(button); folder.el = button; fit(folder);
    }
  }
  const stored = folders.filter(folder => folder.state === 'stored').length;
  $('castle-count').textContent = String(stored);
  castle.setAttribute('aria-label', `打开狼堡，${stored} 个文件夹`);
  $('scene-hint').hidden = folders.some(folder => folder.state === 'pasture');
  if (opened) $('return-to-castle').disabled = opened.state !== 'pasture';
  syncMotion();
}
function ghostAt(clientX, clientY) {
  if (!drag.ghost) {
    const ghost = document.createElement('div'); ghost.className = 'drag-ghost'; ghost.setAttribute('aria-hidden', 'true');
    const image = document.createElement('img'); image.src = './assets/sheep.png'; image.alt = ''; image.draggable = false;
    const label = document.createElement('span'); label.className = 'ghost-name'; label.textContent = drag.folder.name;
    ghost.append(image, label); document.body.append(ghost); drag.ghost = ghost;
    ghost.style.position = 'fixed'; ghost.style.pointerEvents = 'none'; ghost.style.zIndex = '1000';
  }
  drag.clientX = clientX; drag.clientY = clientY;
  drag.ghost.style.left = `${clientX}px`; drag.ghost.style.top = `${clientY}px`;
}
function beginPointer(event, folder, button) {
  if (event.button !== 0 || drag) return;
  event.preventDefault(); button.focus({ preventScroll: true });
  drag = { folder, source: button, pointer: event.pointerId, startX: event.clientX, startY: event.clientY,
    clientX: event.clientX, clientY: event.clientY, moved: false, keyboard: false, ghost: null };
  button.setPointerCapture(event.pointerId);
  button.addEventListener('pointermove', movePointer);
  button.addEventListener('pointerup', endPointer);
  button.addEventListener('pointercancel', cancelDrag);
  button.addEventListener('lostpointercapture', cancelDrag);
  syncMotion();
}
function movePointer(event) {
  if (!drag || drag.keyboard || event.pointerId !== drag.pointer) return;
  if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return;
  drag.moved = true; drag.source.classList.add('drag-source');
  ghostAt(event.clientX, event.clientY);
  castle.classList.toggle('drop-ready', hitsCastle(event.clientX, event.clientY));
}
function hitsCastle(x, y) {
  const rect = castle.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}
function endPointer(event) {
  if (drag && !drag.keyboard && event.pointerId === drag.pointer) finishDrag(false);
}
function cancelDrag() { if (drag) finishDrag(true); }
function finishDrag(cancelled) {
  const current = drag;
  if (!current) return;
  drag = null;
  const { folder, source } = current;
  for (const [type, handler] of [['pointermove', movePointer], ['pointerup', endPointer], ['pointercancel', cancelDrag], ['lostpointercapture', cancelDrag]]) source.removeEventListener(type, handler);
  if (current.pointer !== undefined && source.hasPointerCapture(current.pointer)) source.releasePointerCapture(current.pointer);
  source.classList.remove('drag-source'); current.ghost?.remove(); castle.classList.remove('drop-ready');
  let changed = false;
  if (!cancelled && current.moved) {
    suppressOpenUntil = performance.now() + 350;
    const position = point(current.clientX, current.clientY), box = area(folder);
    if (hitsCastle(current.clientX, current.clientY)) {
      if (folder.state !== 'stored') { folder.state = 'stored'; changed = true; }
      announce(`${folder.name} 已收回狼堡。`);
    } else if (position.x >= box.left && position.x <= box.right && position.y >= box.top && position.y <= box.bottom) {
      if (folder.state !== 'pasture') { folder.state = 'pasture'; changed = true; }
      folder.x = position.x; folder.y = position.y;
      panel.hidden = true; castle.setAttribute('aria-expanded', 'false'); announce(`${folder.name} 变成小羊，来到草原。`);
    } else announce('请放在草原或狼堡上，已回到原处。');
  } else if (cancelled && current.moved) announce('已取消拖动，回到原处。');
  if (changed) render();
  else { if (folder.state === 'pasture') fit(folder); syncMotion(); }
  if (current.keyboard) {
    const focus = folder.el || [...$('folder-list').children].find(button => button.dataset.folderId === folder.id);
    if (focus && (folder.state === 'pasture' || !panel.hidden)) focus.focus({ preventScroll: true });
    else castle.focus({ preventScroll: true });
  }
}
function keyControl(event, folder, button) {
  if (drag?.keyboard) return;
  if (event.key === 'Enter') { event.preventDefault(); openFolder(folder); }
  if (event.key === ' ') {
    event.preventDefault();
    if (drag) return;
    const box = area(folder), pos = folder.state === 'pasture' ? folder : { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
    const client = scenePoint(pos.x, pos.y);
    drag = { folder, source: button, keyboard: true, moved: true, ghost: null };
    button.classList.add('drag-source'); ghostAt(client.x, client.y); syncMotion();
    announce(`已拿起${folder.name}。方向键移动，Enter 放下，Esc 取消。`);
  }
}
document.addEventListener('keydown', event => {
  if (!drag) return;
  if (event.key === 'Escape') { event.preventDefault(); cancelDrag(); return; }
  if (!drag.keyboard) return;
  if (event.key === 'Enter') { event.preventDefault(); finishDrag(false); return; }
  const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  if (direction) {
    event.preventDefault();
    const rect = scene.getBoundingClientRect(), step = event.shiftKey ? 40 : 16;
    ghostAt(clamp(drag.clientX + direction[0] * step, rect.left, rect.right), clamp(drag.clientY + direction[1] * step, rect.top, rect.bottom));
    castle.classList.toggle('drop-ready', hitsCastle(drag.clientX, drag.clientY));
  }
});
window.addEventListener('blur', cancelDrag);
window.addEventListener('resize', () => { cancelDrag(); folders.filter(folder => folder.state === 'pasture').forEach(fit); });

function clearPreview() {
  previewRequest++; if (imageURL) URL.revokeObjectURL(imageURL); imageURL = null; $('file-preview').replaceChildren();
}
async function previewFile(entry) {
  clearPreview(); const request = previewRequest, file = entry.file;
  const heading = document.createElement('h3'); heading.textContent = entry.path; $('file-preview').append(heading);
  const isText = file.type.startsWith('text/') || /\.(txt|md|json|csv|log|xml|ya?ml|ini|html?|css|js|svg)$/i.test(file.name);
  if (isText) {
    const text = await file.slice(0, 512000).text();
    if (request !== previewRequest) return;
    const pre = document.createElement('pre'); pre.textContent = text + (file.size > 512000 ? '\n\n（仅预览前 500 KB。）' : ''); $('file-preview').append(pre);
  } else if (/\.(png|jpe?g|gif|webp|bmp|avif|ico)$/i.test(file.name)) {
    const image = document.createElement('img'); imageURL = URL.createObjectURL(file); image.src = imageURL; image.alt = file.name;
    image.onerror = () => { if (request === previewRequest) { image.remove(); const message = document.createElement('p'); message.textContent = '图片暂时无法预览，可以下载副本。'; $('file-preview').append(message); } };
    $('file-preview').append(image);
  } else { const message = document.createElement('p'); message.textContent = '这个格式可以下载副本后，用本机应用打开。'; $('file-preview').append(message); }
  if (request !== previewRequest) return;
  const download = document.createElement('button'); download.type = 'button'; download.className = 'download-copy'; download.textContent = '下载副本';
  download.onclick = () => { const url = URL.createObjectURL(file), link = document.createElement('a'); link.href = url; link.download = file.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  $('file-preview').append(download);
}
function openFolder(folder) {
  if (drag) return;
  opened = folder; clearPreview(); $('folder-title').textContent = folder.name;
  $('folder-meta').textContent = `${folder.example ? '示例文件夹' : '本次选择的本地文件夹'}，${folder.files.length} 个文件。原文件不会移动或改写。`;
  $('file-list').replaceChildren();
  for (const entry of folder.files) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'file-entry'; button.textContent = entry.path;
    button.onclick = () => previewFile(entry); $('file-list').append(button);
  }
  $('return-to-castle').disabled = folder.state !== 'pasture';
  if (!dialog.open) dialog.showModal();
  if (folder.files[0]) previewFile(folder.files[0]);
}
castle.onclick = () => { panel.hidden = !panel.hidden; castle.setAttribute('aria-expanded', String(!panel.hidden)); };
$('close-storage').onclick = () => { panel.hidden = true; castle.setAttribute('aria-expanded', 'false'); castle.focus(); };
$('close-folder').onclick = () => dialog.close();
dialog.addEventListener('close', () => { clearPreview(); opened = null; });
$('return-to-castle').onclick = () => {
  if (!opened) return;
  const folder = opened; folder.state = 'stored'; dialog.close(); render(); announce(`${folder.name} 已收回狼堡。`); castle.focus();
};
$('add-folder').onclick = () => $('folder-input').click();
$('folder-input').onchange = event => {
  const groups = new Map();
  for (const file of event.target.files) {
    const parts = (file.webkitRelativePath || file.name).split('/'), root = parts.length > 1 ? parts.shift() : '本地文件夹';
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push({ path: parts.join('/'), file });
  }
  for (const [name, files] of groups) makeFolder(name, files);
  event.target.value = '';
  if (groups.size) { render(); panel.hidden = false; castle.setAttribute('aria-expanded', 'true'); announce(`${groups.size} 个文件夹已放进狼堡，仅保留在本次页面。`); }
};

function activeMotion() { return !paused && !document.hidden && folders.some(folder => folder.state === 'pasture'); }
function animate(now) {
  const dt = Math.max(0, (now - lastFrame) / 1000); lastFrame = now; time += dt;
  for (const folder of folders) {
    if (folder.state !== 'pasture' || drag?.folder === folder) continue;
    const walking = (time + folder.phase) % 18 > 5, box = area(folder);
    folder.el.classList.toggle('is-walking', walking); folder.el.classList.toggle('is-grazing', !walking);
    if (walking) {
      folder.x += folder.direction * .009 * dt; folder.y += Math.sin(time * .4 + folder.phase) * .0025 * dt;
      if (folder.x < box.left || folder.x > box.right) folder.direction *= -1;
      folder.x = clamp(folder.x, box.left, box.right); folder.y = clamp(folder.y, box.top, box.bottom); place(folder);
    }
  }
  if (activeMotion()) frameId = requestAnimationFrame(animate);
}
function syncMotion() {
  cancelAnimationFrame(frameId);
  $('motion-toggle').textContent = paused ? '继续漫游' : '暂停漫游'; $('motion-toggle').setAttribute('aria-pressed', String(paused));
  for (const folder of folders) if (folder.el && (!activeMotion() || drag?.folder === folder)) folder.el.classList.remove('is-walking');
  if (activeMotion()) { lastFrame = performance.now(); frameId = requestAnimationFrame(animate); }
}
$('motion-toggle').onclick = () => { paused = !paused; syncMotion(); };
motionMedia.addEventListener('change', event => { if (event.matches) paused = true; syncMotion(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelDrag(); syncMotion(); });
render();
