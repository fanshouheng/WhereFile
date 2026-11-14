const encoder = new TextEncoder();
const names = /^(?:theme\.json|README\.txt|LICENSE\.txt|background\.(?:png|jpg|webp)|object\.png)$/;
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

export function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

export function makeZip(entries) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 6) throw new Error('Invalid theme archive entries');
  const seen = new Set();
  const files = entries.map(entry => {
    if (!names.test(entry.name) || seen.has(entry.name) || !(entry.bytes instanceof Uint8Array)) throw new Error('Invalid theme archive entry');
    seen.add(entry.name);
    return { ...entry, encoded: encoder.encode(entry.name), crc: crc32(entry.bytes) };
  });
  const bodySize = files.reduce((size, file) => size + 30 + file.encoded.length + file.bytes.length, 0);
  const directorySize = files.reduce((size, file) => size + 46 + file.encoded.length, 0);
  if (bodySize > 12 * 1048576) throw new Error('Theme archive too large');
  const result = new Uint8Array(bodySize + directorySize + 22);
  const view = new DataView(result.buffer);
  const u16 = (offset, value) => view.setUint16(offset, value, true);
  const u32 = (offset, value) => view.setUint32(offset, value, true);
  let offset = 0;
  for (const file of files) {
    file.offset = offset;
    u32(offset, 0x04034b50); u16(offset + 4, 20); u16(offset + 6, 0x800);
    u16(offset + 12, 33); // 1980-01-01, deterministic ZIP DOS date.
    u32(offset + 14, file.crc); u32(offset + 18, file.bytes.length); u32(offset + 22, file.bytes.length);
    u16(offset + 26, file.encoded.length);
    result.set(file.encoded, offset + 30);
    result.set(file.bytes, offset + 30 + file.encoded.length);
    offset += 30 + file.encoded.length + file.bytes.length;
  }
  for (const file of files) {
    u32(offset, 0x02014b50); u16(offset + 4, 20); u16(offset + 6, 20); u16(offset + 8, 0x800);
    u16(offset + 14, 33); u32(offset + 16, file.crc);
    u32(offset + 20, file.bytes.length); u32(offset + 24, file.bytes.length);
    u16(offset + 28, file.encoded.length); u32(offset + 42, file.offset);
    result.set(file.encoded, offset + 46);
    offset += 46 + file.encoded.length;
  }
  u32(offset, 0x06054b50); u16(offset + 8, files.length); u16(offset + 10, files.length);
  u32(offset + 12, directorySize); u32(offset + 16, bodySize);
  return result;
}
