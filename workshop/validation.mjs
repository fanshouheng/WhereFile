import { crc32 } from './zip.mjs';

export class WorkshopError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const fail = message => { throw new WorkshopError(message); };
const decoder = new TextDecoder('ascii');
const word = (bytes, start, length = 4) => decoder.decode(bytes.subarray(start, start + length));
const maxBytes = { background: 8 * 1048576, sprite: 2 * 1048576 };

function png(bytes) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes[index] === value)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8, width, height, color, bitDepth, hasPalette = false, alpha = false, data = false, endedData = false, count = 0, dataLength = 0;
  const seen = new Set();
  while (offset + 12 <= bytes.length) {
    if (++count > 1024) fail('PNG 数据分段过多，请重新导出图片。');
    const length = view.getUint32(offset), type = word(bytes, offset + 4), end = offset + 12 + length;
    if (end > bytes.length || !/^[A-Za-z]{4}$/.test(type)) fail('PNG 文件结构不完整。');
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== view.getUint32(end - 4)) fail('PNG 文件校验失败，请重新导出图片。');
    if (!seen.size && type !== 'IHDR') fail('PNG 缺少图片尺寸。');
    if (['acTL', 'fcTL', 'fdAT'].includes(type)) fail('暂不支持动画 PNG，请上传静态图片。');
    if (type === 'IHDR') {
      if (seen.has(type) || length !== 13) fail('PNG 图片头无效。');
      width = view.getUint32(offset + 8); height = view.getUint32(offset + 12);
      bitDepth = bytes[offset + 16]; color = bytes[offset + 17];
      const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!depths[color]?.includes(bitDepth) || bytes[offset + 18] || bytes[offset + 19] || bytes[offset + 20] > 1) fail('PNG 编码不受支持。');
      alpha = color === 4 || color === 6;
    } else if (type === 'PLTE') {
      if (data || seen.has(type) || !length || length % 3 || length > 768 || [0, 4].includes(color)) fail('PNG 调色板无效。');
      hasPalette = true;
    } else if (type === 'tRNS') {
      if (data || seen.has(type) || !length || (color === 3 && (!hasPalette || length > 256)) ||
        (color === 0 && length !== 2) || (color === 2 && length !== 6) || [4, 6].includes(color)) fail('PNG 透明通道无效。');
      alpha = true;
    } else if (type === 'IDAT') {
      if (endedData || (color === 3 && !hasPalette)) fail('PNG 图像数据顺序无效。');
      data = true; dataLength += length;
    } else if (type === 'IEND') {
      if (length || !data || dataLength < 6 || end !== bytes.length) fail('PNG 文件末尾无效。');
      return { width, height, alpha, extension: 'png', contentType: 'image/png' };
    } else {
      if (type[0] === type[0].toUpperCase()) fail('PNG 包含不受支持的图片数据。');
      if (data) endedData = true;
    }
    seen.add(type); offset = end;
  }
  fail('PNG 文件结构不完整。');
}

function jpeg(bytes) {
  if (bytes[0] !== 255 || bytes[1] !== 216) return null;
  let offset = 2, width, height, scan = false, frame = false, count = 0;
  while (offset < bytes.length) {
    if (++count > 4096) fail('JPEG 数据分段过多，请重新导出图片。');
    if (bytes[offset++] !== 255) fail('JPEG 文件结构无效。');
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 217) {
      if (!frame || !scan || offset !== bytes.length) fail('JPEG 文件末尾无效。');
      return { width, height, alpha: false, extension: 'jpg', contentType: 'image/jpeg' };
    }
    if (marker === 0 || marker === 216 || marker === 1 || (marker >= 208 && marker <= 215) || offset + 2 > bytes.length) fail('JPEG 标记无效。');
    const length = bytes[offset] * 256 + bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) fail('JPEG 文件结构不完整。');
    if ([192, 193, 194].includes(marker)) {
      const components = bytes[offset + 7];
      if (frame || bytes[offset + 2] !== 8 || ![1, 3, 4].includes(components) || length !== 8 + components * 3) fail('JPEG 图片头无效。');
      height = bytes[offset + 3] * 256 + bytes[offset + 4]; width = bytes[offset + 5] * 256 + bytes[offset + 6]; frame = true;
    } else if (marker >= 195 && marker <= 207 && ![196, 200, 204].includes(marker)) {
      fail('请上传常规或渐进式 JPEG 图片。');
    }
    offset += length;
    if (marker === 218) {
      if (!frame || length < 6) fail('JPEG 图像数据无效。');
      scan = true;
      while (offset < bytes.length) {
        if (bytes[offset] !== 255) { offset++; continue; }
        const next = bytes[offset + 1];
        if (next === 0 || (next >= 208 && next <= 215)) { offset += 2; continue; }
        break;
      }
    }
  }
  fail('JPEG 文件缺少结束标记。');
}

function webp(bytes) {
  if (word(bytes, 0) !== 'RIFF' || word(bytes, 8) !== 'WEBP') return null;
  if (bytes.length < 20) fail('WebP 文件结构不完整。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) + 8 !== bytes.length) fail('WebP 文件长度无效。');
  let offset = 12, canvas, image, alpha = false, first = true, count = 0;
  while (offset + 8 <= bytes.length) {
    if (++count > 256) fail('WebP 数据分段过多，请重新导出图片。');
    const type = word(bytes, offset), length = view.getUint32(offset + 4, true), data = offset + 8, end = data + length;
    if (end > bytes.length) fail('WebP 文件结构不完整。');
    if (['ANIM', 'ANMF'].includes(type)) fail('暂不支持动画 WebP，请上传静态图片。');
    if (type === 'VP8X') {
      if (!first || length !== 10 || bytes[data] & 0xc3 || bytes[data + 1] || bytes[data + 2] || bytes[data + 3]) fail('WebP 图片头无效。');
      canvas = [1 + bytes[data + 4] + (bytes[data + 5] << 8) + (bytes[data + 6] << 16),
        1 + bytes[data + 7] + (bytes[data + 8] << 8) + (bytes[data + 9] << 16)];
      alpha = !!(bytes[data] & 0x10);
    } else if (type === 'VP8 ') {
      if (image || length < 10 || bytes[data] & 1 || bytes[data + 3] !== 157 || bytes[data + 4] !== 1 || bytes[data + 5] !== 42) fail('WebP 图像数据无效。');
      image = [view.getUint16(data + 6, true) & 0x3fff, view.getUint16(data + 8, true) & 0x3fff];
    } else if (type === 'VP8L') {
      if (image || length < 5 || bytes[data] !== 47 || bytes[data + 4] >> 5) fail('WebP 无损图像数据无效。');
      const bits = view.getUint32(data + 1, true);
      image = [1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff)]; alpha ||= !!(bits & 0x10000000);
    } else if (!['ALPH', 'ICCP', 'EXIF', 'XMP '].includes(type) || !canvas) fail('WebP 包含不受支持的数据。');
    offset = end + (length & 1); first = false;
  }
  if (offset !== bytes.length || !image || (canvas && (canvas[0] !== image[0] || canvas[1] !== image[1]))) fail('WebP 图片尺寸或末尾无效。');
  return { width: image[0], height: image[1], alpha, extension: 'webp', contentType: 'image/webp' };
}

async function image(file, kind) {
  const label = kind === 'sprite' ? '透明物件' : '背景';
  if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function' || !file.size) fail(`请选择${label}图片。`);
  if (file.size > maxBytes[kind]) throw new WorkshopError(`${label}图片不能超过 ${kind === 'sprite' ? 2 : 8} MB。`, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = png(bytes) || jpeg(bytes) || webp(bytes);
  if (!info || (kind === 'sprite' && info.extension !== 'png')) fail(kind === 'sprite' ? '物件请上传带透明通道的 PNG 图片。' : '背景只支持 PNG、JPEG 或静态 WebP 图片。');
  if (file.type && file.type !== 'application/octet-stream' && file.type !== info.contentType) fail(`${label}图片格式与文件内容不一致。`);
  const { width, height } = info;
  const minimum = kind === 'sprite' ? [32, 32] : [640, 360], maximum = kind === 'sprite' ? 2048 : 4096;
  if (width < minimum[0] || height < minimum[1] || width > maximum || height > maximum || width * height > 16000000) fail(`${label}图片尺寸需在 ${minimum.join(' × ')} 至 ${maximum} × ${maximum} 像素之间，且不超过 1600 万像素。`);
  if (kind === 'sprite' && !info.alpha) fail('物件 PNG 需要透明通道，请移除背景后重新导出。');
  return { bytes, ...info };
}

function textField(form, key, limit, required = false) {
  const value = form.get(key) ?? '';
  if (typeof value !== 'string' || value.trim().length > limit || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) fail(`${key === 'title' ? '主题名称' : key === 'author' ? '作者名称' : key === 'provenance' ? '素材来源' : '文字说明'}格式或长度不正确。`);
  if (required && !value.trim()) fail('请填写主题名称、作者和素材来源。');
  return value.trim();
}

export async function validateSubmission(form) {
  const fields = new Set(['title', 'author', 'description', 'provenance', 'rightsAccepted', 'license', 'config', 'background', 'sprite']);
  for (const key of form.keys()) if (!fields.has(key) || form.getAll(key).length !== 1) fail('提交包含重复或不受支持的字段。');
  const title = textField(form, 'title', 60, true), author = textField(form, 'author', 40, true);
  const description = textField(form, 'description', 600), provenance = textField(form, 'provenance', 600, true);
  if (form.get('rightsAccepted') !== 'true' || form.get('license') !== 'personal-use') fail('请确认你有权分享素材，并同意仅供个人使用的分享条款。');
  const rawConfig = form.get('config');
  let value;
  try { if (typeof rawConfig !== 'string' || rawConfig.length > 2048) throw new Error(); value = JSON.parse(rawConfig); }
  catch { fail('运动设置不是有效的主题配置。'); }
  const keys = ['schema_version', 'name', 'renderer', 'background', 'sprite', 'region', 'object_scale', 'duration', 'motion', 'forward_degrees'];
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).some(key => !keys.includes(key)) ||
    value.schema_version !== 1 || value.renderer !== 'static') fail('主题配置仅支持版本 1 的静态背景，不支持自定义脚本。');
  if ((value.name !== undefined && (typeof value.name !== 'string' || value.name.length > 60)) ||
    (value.background !== undefined && !/^background\.(?:png|jpg|webp)$/.test(value.background)) ||
    (value.sprite !== undefined && value.sprite !== 'object.png')) fail('主题配置中的图片名称无效。');
  const { region, object_scale, duration, motion, forward_degrees } = value;
  if (!Array.isArray(region) || region.length !== 4 || !region.every(number => Number.isFinite(number) && number >= 0 && number <= 1) ||
    region[2] - region[0] + 1e-9 < .15 || region[3] - region[1] + 1e-9 < .15) fail('活动区域需在图片以内，宽高各至少占 15%。');
  if (!Number.isFinite(object_scale) || object_scale < .04 || object_scale > .2 || !Number.isFinite(duration) || duration < 10 || duration > 180 ||
    !['float', 'heading', 'spin', 'sway'].includes(motion) || !Number.isFinite(forward_degrees) || forward_degrees < 0 || forward_degrees > 359) fail('物件大小、运动方式或速度设置超出范围。');
  const background = await image(form.get('background'), 'background'), sprite = await image(form.get('sprite'), 'sprite');
  const config = { schema_version: 1, name: title, renderer: 'static', background: `background.${background.extension}`, sprite: 'object.png',
    region: [...region], object_scale, duration, motion, forward_degrees };
  return { title, author, description, provenance, license: 'personal-use', config, background, sprite };
}
