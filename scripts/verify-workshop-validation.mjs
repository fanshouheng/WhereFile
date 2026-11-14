import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { File } from 'node:buffer';
import { validateSubmission } from '../workshop/validation.mjs';
import { crc32, makeZip } from '../workshop/zip.mjs';

function chunk(name, data = Buffer.alloc(0)) {
  const header = Buffer.alloc(4); header.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(name), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([header, body, crc]);
}
function png(width, height, color = 6) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = color;
  const channels = color === 6 ? 4 : 3;
  const pixels = Buffer.alloc((width * channels + 1) * height);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND')]);
}
function jpeg(width, height) {
  const segment = (marker, data) => { const prefix = Buffer.from([255, marker, 0, 0]); prefix.writeUInt16BE(data.length + 2, 2); return Buffer.concat([prefix, data]); };
  const frame = Buffer.from([8, 0, 0, 0, 0, 1, 1, 17, 0]); frame.writeUInt16BE(height, 1); frame.writeUInt16BE(width, 3);
  // One DC-zero code and one end-of-block code encode a uniform gray image.
  const dc = Buffer.alloc(18); dc[1] = 1;
  const ac = Buffer.from(dc); ac[0] = 16;
  return Buffer.concat([Buffer.from([255, 216]), segment(219, Buffer.concat([Buffer.from([0]), Buffer.alloc(64, 1)])),
    segment(192, frame), segment(196, Buffer.concat([dc, ac])), segment(218, Buffer.from([1, 1, 0, 0, 63, 0])),
    Buffer.alloc(Math.ceil(Math.ceil(width / 8) * Math.ceil(height / 8) * 2 / 8)), Buffer.from([255, 217])]);
}
const background = png(640, 360), sprite = png(48, 48);
const settings = { schema_version: 1, name: '旧名称', renderer: 'static', background: 'background.png', sprite: 'object.png',
  region: [.1, .2, .9, .9], object_scale: .09, duration: 48, motion: 'float', forward_degrees: 0 };
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ title: '静静的湖', author: '测试作者', description: '本地验证用主题', provenance: '自行绘制', rightsAccepted: 'true', license: 'personal-use' })) data.set(key, value);
  data.set('config', JSON.stringify(settings));
  data.set('background', new File([background], '../../background.png', { type: 'image/png' }));
  data.set('sprite', new File([sprite], '物件.png', { type: 'image/png' }));
  return data;
}
async function invalid(change, pattern, status = 400) {
  const input = form(); change(input);
  await assert.rejects(validateSubmission(input), error => error.status === status && pattern.test(error.message));
}
function config(change) { return input => input.set('config', JSON.stringify({ ...settings, ...change })); }

const valid = await validateSubmission(form());
assert.equal(valid.config.name, '静静的湖');
assert.equal(valid.config.background, 'background.png');
assert.equal(valid.background.width, 640);
assert.equal(valid.sprite.alpha, true);
const exactBoundary = form();
config({ region: [.45, .45, .6, .6] })(exactBoundary);
assert.deepEqual((await validateSubmission(exactBoundary)).config.region, [.45, .45, .6, .6]);
assert.deepEqual(Object.keys(valid.config), ['schema_version', 'name', 'renderer', 'background', 'sprite', 'region', 'object_scale', 'duration', 'motion', 'forward_degrees']);

const realWebp = new FormData();
for (const [key, value] of form()) realWebp.set(key, value);
realWebp.set('background', new File([await readFile(new URL('../assets/coast-hd.webp', import.meta.url))], '图片.webp', { type: 'image/webp' }));
assert.equal((await validateSubmission(realWebp)).background.contentType, 'image/webp');
const realJpeg = form();
realJpeg.set('background', new File([jpeg(640, 360)], '背景.jpg', { type: 'image/jpeg' }));
assert.equal((await validateSubmission(realJpeg)).config.background, 'background.jpg');

await invalid(input => input.set('rightsAccepted', 'false'), /确认/);
await invalid(input => input.set('provenance', ''), /填写/);
await invalid(input => input.append('title', '重复'), /重复/);
await invalid(input => input.set('script', 'alert(1)'), /不受支持/);
await invalid(input => input.set('title', 'A'.repeat(61)), /长度/);
await invalid(input => input.set('description', '\0'), /格式/);
await invalid(config({ script: 'alert(1)' }), /自定义脚本/);
await invalid(config({ renderer: 'html' }), /自定义脚本/);
await invalid(config({ background: 'https://example.com/a.png' }), /图片名称/);
await invalid(config({ sprite: '../../.local/key' }), /图片名称/);
await invalid(config({ region: [.9, .1, .2, .8] }), /活动区域/);
await invalid(config({ region: [0, 0, 1.1, 1] }), /活动区域/);
await invalid(config({ object_scale: .001 }), /超出范围/);
await invalid(config({ duration: 999999 }), /超出范围/);
await invalid(config({ forward_degrees: -1 }), /超出范围/);
await invalid(input => input.set('config', '{'), /有效的主题配置/);
await invalid(input => input.set('config', 'x'.repeat(2049)), /有效的主题配置/);
await invalid(input => input.set('background', new File(['<svg onload="alert(1)"></svg>'], 'photo.png', { type: 'image/png' })), /只支持/);
await invalid(input => input.set('background', new File([background], 'background.jpg', { type: 'image/jpeg' })), /不一致/);
await invalid(input => input.set('sprite', new File([png(48, 48, 2)], 'object.png', { type: 'image/png' })), /透明通道/);
await invalid(input => input.set('sprite', new File([png(16, 16)], 'object.png', { type: 'image/png' })), /尺寸/);
await invalid(input => input.set('background', new File([png(5000, 360)], 'background.png', { type: 'image/png' })), /尺寸/);
const corrupt = Buffer.from(background); corrupt[corrupt.length - 5] ^= 1;
await invalid(input => input.set('background', new File([corrupt], 'background.png', { type: 'image/png' })), /校验/);
await invalid(input => input.set('background', new File([background, '<html>'], 'background.png', { type: 'image/png' })), /末尾/);
await invalid(input => input.set('background', new File([jpeg(640, 360).subarray(0, -2)], 'broken.jpg', { type: 'image/jpeg' })), /结束标记/);
const animated = Buffer.concat([background.subarray(0, 33), chunk('acTL', Buffer.alloc(8)), background.subarray(33)]);
await invalid(input => input.set('background', new File([animated], 'animation.png', { type: 'image/png' })), /动画 PNG/);
await invalid(input => input.set('background', new File([Buffer.alloc(8 * 1048576 + 1)], 'large.png', { type: 'image/png' })), /不能超过/, 413);
await invalid(input => input.set('sprite', new File([Buffer.alloc(2 * 1048576 + 1)], 'large.png', { type: 'image/png' })), /不能超过/, 413);
console.log('PASS: valid real WebP/transparent PNG, normalized data-only settings; malformed, active, oversized and unlicensed submissions rejected.');

assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
let randomState = 0x12345678;
const randomBytes = Uint8Array.from({ length: 65573 }, () => {
  randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5;
  return randomState & 255;
});
const crcCases = [];
for (const length of [0, 1, 7, 8, 15, 16, 17, 31, 32, 33, 255, 1024, 65536]) {
  for (const offset of [0, 1, 13, 37]) {
    const bytes = randomBytes.subarray(offset, offset + length);
    crcCases.push({ offset, length, bytes });
  }
}
const crcReference = spawnSync('python', ['-X', 'utf8', '-c',
  'import base64,json,sys,zlib; print(json.dumps([zlib.crc32(base64.b64decode(s)) for s in json.load(sys.stdin)]))'],
{ input: JSON.stringify(crcCases.map(({ bytes }) => Buffer.from(bytes).toString('base64'))), encoding: 'utf8' });
assert.equal(crcReference.status, 0, crcReference.stderr || crcReference.error?.message);
const expectedCrcs = JSON.parse(crcReference.stdout);
crcCases.forEach(({ offset, length, bytes }, index) => assert.equal(crc32(bytes), expectedCrcs[index], `CRC mismatch at offset ${offset}, length ${length}`));
const archive = makeZip([
  { name: 'theme.json', bytes: new TextEncoder().encode(JSON.stringify(valid.config)) },
  { name: 'background.png', bytes: valid.background.bytes },
  { name: 'object.png', bytes: valid.sprite.bytes },
  { name: 'README.txt', bytes: new TextEncoder().encode('仅供个人使用。') },
]);
const checked = spawnSync('python', ['-X', 'utf8', '-c',
  'import io,json,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; assert set(z.namelist())=={"theme.json","background.png","object.png","README.txt"}; assert json.loads(z.read("theme.json"))["name"]=="静静的湖"; assert z.read("README.txt").decode()=="仅供个人使用。"'],
{ input: archive, encoding: 'utf8' });
assert.equal(checked.status, 0, checked.stderr || checked.error?.message);
for (const name of ['../theme.json', '/theme.json', 'folder/theme.json', 'theme.js', '.env', 'background.svg']) {
  assert.throws(() => makeZip([{ name, bytes: new Uint8Array() }]), /Invalid/);
}
assert.throws(() => makeZip([{ name: 'theme.json', bytes: new Uint8Array() }, { name: 'theme.json', bytes: new Uint8Array() }]), /Invalid/);
console.log('PASS: generated archive opens in Python zipfile with correct content/CRC; traversal, duplicate and executable entries rejected.');
