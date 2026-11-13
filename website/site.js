const landscape = document.querySelector('#landscape');
const heroImage = document.querySelector('#hero-image');
const demoFile = document.querySelector('#demo-file');
const demoHint = document.querySelector('#demo-hint');
const demoStatus = document.querySelector('#demo-status');
const motionButton = document.querySelector('#motion-toggle');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const scenes = {
  tropical: { file: 'coast-hd.webp', description: '阳光下的热带海湾，左边是沙滩，右边是清澈海水' },
  snow: { file: 'coast-snow.webp', description: '覆雪松林旁的蓝色湖岸' },
  autumn: { file: 'coast-autumn.webp', description: '暖色秋叶围绕的湖畔' },
};

function setScene(id) {
  landscape.dataset.scene = id;
  heroImage.src = `./assets/${scenes[id].file}`;
  heroImage.alt = scenes[id].description;
  document.querySelectorAll('.scene-choice').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scene === id)));
}
document.querySelectorAll('.scene-choice').forEach(button => button.addEventListener('click', () => setScene(button.dataset.scene)));
document.querySelectorAll('[data-preview]').forEach(button => button.addEventListener('click', () => {
  setScene(button.dataset.preview);
  landscape.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
}));

function setPaused(paused) {
  landscape.classList.toggle('paused', paused);
  motionButton.setAttribute('aria-pressed', String(paused));
  motionButton.setAttribute('aria-label', paused ? '播放风景动画' : '暂停风景动画');
  motionButton.querySelector('span').textContent = paused ? '播放' : '暂停';
  motionButton.querySelector('path').setAttribute('d', paused ? 'M6 3 16 10 6 17Z' : 'M6 4v12M14 4v12');
}
setPaused(reducedMotion.matches);
motionButton.addEventListener('click', () => setPaused(!landscape.classList.contains('paused')));
reducedMotion.addEventListener('change', event => setPaused(event.matches));

function setFileAtSea(atSea) {
  demoFile.classList.toggle('at-sea', atSea);
  demoFile.style.left = atSea ? '61%' : '';
  demoFile.style.top = atSea ? '64%' : '';
  demoFile.setAttribute('aria-label', atSea ? '将示意小船旅行清单.txt 放回岸边' : '将示意文件旅行清单.txt 放入海里');
  demoHint.hidden = atSea;
  demoStatus.textContent = atSea ? '旅行清单变成小船了。点击小船可以回到岸边。这是网页示意，没有读取你的文件。' : '旅行清单已回到岸边。';
}
let drag = null;
let skipClick = false;
demoFile.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  const rect = demoFile.getBoundingClientRect();
  drag = { startX: event.clientX, startY: event.clientY, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, moved: false };
  demoFile.setPointerCapture(event.pointerId);
});
demoFile.addEventListener('pointermove', event => {
  if (!drag) return;
  if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5 && !drag.moved) return;
  drag.moved = true;
  const bounds = landscape.getBoundingClientRect();
  const x = Math.max(0, Math.min(bounds.width - demoFile.offsetWidth, event.clientX - bounds.left - drag.offsetX));
  const y = Math.max(0, Math.min(bounds.height - demoFile.offsetHeight - 75, event.clientY - bounds.top - drag.offsetY));
  demoFile.style.left = `${x / bounds.width * 100}%`;
  demoFile.style.top = `${y / bounds.height * 100}%`;
  demoFile.classList.toggle('at-sea', (x + demoFile.offsetWidth / 2) / bounds.width > .38);
});
demoFile.addEventListener('pointerup', event => {
  if (!drag) return;
  skipClick = drag.moved;
  if (drag.moved) {
    const bounds = landscape.getBoundingClientRect();
    setFileAtSea((event.clientX - bounds.left) / bounds.width > .38);
  }
  drag = null;
});
demoFile.addEventListener('pointercancel', () => { drag = null; setFileAtSea(demoFile.classList.contains('at-sea')); });
demoFile.addEventListener('click', () => {
  if (skipClick) { skipClick = false; return; }
  setFileAtSea(!demoFile.classList.contains('at-sea'));
});

async function prepareDownload() {
  const links = document.querySelectorAll('[data-download]');
  try {
    const response = await fetch('./download.json');
    if (!response.ok) throw new Error('Download metadata unavailable');
    const release = await response.json();
    const url = new URL(release.url, location.href);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid download URL');
    links.forEach(link => {
      link.href = url.href;
      link.setAttribute('download', '');
    });
    const size = release.size ? `，${(release.size / 1048576).toFixed(1)} MB` : '';
    document.querySelector('#download-meta').textContent = `v${release.version}${size} · Windows 10 / 11，64 位`;
    const checksum = document.querySelector('#checksum-link');
    if (!release.sha256) checksum.hidden = true;
  } catch {
    links.forEach(link => { link.href = '#download'; });
    document.querySelector('#download-error').hidden = false;
    document.querySelector('#checksum-link').hidden = true;
  }
}
prepareDownload();
