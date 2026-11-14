// All themes use this renderer; submitted themes never supply executable code.
export function createPreview(container, options = {}) {
  const background = document.createElement('img');
  background.className = 'preview-background';
  background.alt = '';
  const region = document.createElement('div');
  region.className = 'preview-region';
  region.hidden = true;
  container.replaceChildren(background, region);
  const loadStatus = document.createElement('p');
  loadStatus.className = 'form-status';
  loadStatus.setAttribute('role', 'status');
  loadStatus.hidden = true;
  loadStatus.append('图片暂未加载完成，请稍后重试。 ');
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'text-button';
  retry.textContent = '重新加载';
  loadStatus.append(retry);
  container.after(loadStatus);
  const failedImages = new Set();
  const objects = [];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reducedMotion.matches;
  let config = {};
  let urls = {};
  let elapsed = 0;
  let previous = 0;
  let frame = 0;
  let destroyed = false;

  function assetURL(value) {
    if (!value) return '';
    const url = new URL(value, location.href);
    return url.origin === location.origin || (url.protocol === 'blob:' && url.pathname.startsWith(location.origin)) ? url.href : '';
  }
  function onImageLoad(event) {
    if (destroyed) return;
    failedImages.delete(event.currentTarget);
    loadStatus.hidden = failedImages.size === 0;
    if (event.currentTarget === background && background.naturalWidth && background.naturalHeight) container.style.aspectRatio = `${background.naturalWidth}/${background.naturalHeight}`;
    render();
  }
  function onImageError(event) {
    if (destroyed) return;
    failedImages.add(event.currentTarget);
    loadStatus.hidden = false;
  }
  function listenImage(image, remove = false) {
    const method = remove ? 'removeEventListener' : 'addEventListener';
    image[method]('load', onImageLoad);
    image[method]('error', onImageError);
    if (remove) failedImages.delete(image);
  }
  function retryImages() {
    for (const image of failedImages) {
      const url = new URL(assetURL(image === background ? urls.background : urls.sprite));
      if (url.protocol !== 'blob:') url.searchParams.set('_retry', String(Date.now()));
      image.src = url.href;
    }
  }
  listenImage(background);
  retry.addEventListener('click', retryImages);
  function render() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    const [left, top, right, bottom] = config.region || [.1, .2, .9, .9];
    region.style.left = `${left * 100}%`;
    region.style.top = `${top * 100}%`;
    region.style.width = `${(right - left) * 100}%`;
    region.style.height = `${(bottom - top) * 100}%`;
    objects.forEach(({element, image}, index) => {
      const ratio = image.naturalWidth / image.naturalHeight || 1;
      const size = Math.max(1, Math.min(width * (config.object_scale || .09), (right - left) * width * .72, ((bottom - top) * height - 19) * .72));
      const imageWidth = size * Math.min(1, ratio);
      const imageHeight = size / Math.max(1, ratio);
      const footprint = ['heading', 'spin'].includes(config.motion) ? Math.hypot(imageWidth, imageHeight) : Math.max(imageWidth, imageHeight) * (config.motion === 'sway' ? 1.15 : 1);
      element.style.width = `${imageWidth}px`;
      element.style.height = `${imageHeight}px`;
      const x1 = Math.max(footprint / 2, left * width + footprint / 2);
      const x2 = Math.max(x1, Math.min(width - footprint / 2, right * width - footprint / 2));
      const y1 = Math.max(footprint / 2 + 19, top * height + footprint / 2 + 19);
      const y2 = Math.max(y1, Math.min(height - footprint / 2, bottom * height - footprint / 2));
      const angle = elapsed / (config.duration || 48) * Math.PI * 2 + index * Math.PI * .8;
      const x = (x1 + x2) / 2 + Math.sin(angle) * (x2 - x1) * .46;
      const y = (y1 + y2) / 2 + Math.sin(angle * 2 + index * .7) * (y2 - y1) * .43;
      let rotation = 0;
      if (config.motion === 'heading') rotation = Math.atan2((y2 - y1) * .86 * Math.cos(angle * 2 + index * .7), (x2 - x1) * .46 * Math.cos(angle)) * 180 / Math.PI - (config.forward_degrees || 0);
      if (config.motion === 'spin') rotation = elapsed * 7 + index * 40;
      if (config.motion === 'sway') rotation = Math.sin(elapsed * .8 + index) * 8;
      element.style.translate = `${x - imageWidth / 2}px ${y - imageHeight / 2}px`;
      image.style.transform = `rotate(${rotation}deg)`;
    });
  }
  function tick(now) {
    frame = 0;
    if (destroyed || paused || document.hidden) { previous = 0; return; }
    if (previous) elapsed += Math.min((now - previous) / 1000, .1);
    previous = now;
    render();
    frame = requestAnimationFrame(tick);
  }
  function schedule() { if (!frame && !paused && !document.hidden && !destroyed) frame = requestAnimationFrame(tick); }
  function update(next) {
    config = {...config, ...next.config};
    region.hidden = !next.showRegion;
    if (next.background !== undefined && next.background !== urls.background) {
      urls.background = next.background;
      failedImages.delete(background);
      background.src = assetURL(next.background);
      background.hidden = !next.background;
    }
    if (next.sprite !== undefined && next.sprite !== urls.sprite) {
      urls.sprite = next.sprite;
      objects.forEach(({element, image}) => { listenImage(image, true); element.remove(); });
      objects.length = 0;
      if (next.sprite) ['灵感.txt', '周末计划', '我的文件夹'].forEach(label => {
        const element = document.createElement('div');
        element.className = 'preview-object';
        const name = document.createElement('span');
        name.className = 'preview-filename';
        name.textContent = label;
        const image = document.createElement('img');
        listenImage(image);
        image.src = assetURL(next.sprite);
        image.alt = '';
        element.append(name, image);
        container.append(element);
        objects.push({element, image});
      });
    }
    loadStatus.hidden = failedImages.size === 0;
    render();
    schedule();
  }
  function setPaused(value) {
    paused = value;
    previous = 0;
    if (paused) { cancelAnimationFrame(frame); frame = 0; }
    else schedule();
    return paused;
  }
  function onVisibility() { previous = 0; schedule(); }
  function onMotion() { setPaused(reducedMotion.matches); options.onPauseChange?.(paused); }
  const observer = new ResizeObserver(render);
  observer.observe(container);
  document.addEventListener('visibilitychange', onVisibility);
  reducedMotion.addEventListener('change', onMotion);
  update(options);
  return {update, setPaused, get paused() { return paused; }, destroy() {
    destroyed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    listenImage(background, true);
    objects.forEach(({image}) => listenImage(image, true));
    retry.removeEventListener('click', retryImages);
    loadStatus.remove();
    document.removeEventListener('visibilitychange', onVisibility);
    reducedMotion.removeEventListener('change', onMotion);
  }};
}
