/**
 * @module pngUtil
 * Shared pure-JS PNG encode and decode utilities.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++)
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function concatU8(...arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

function u32be(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, false);
  return b;
}

function pngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const crcIn = concatU8(typeBytes, data);
  return concatU8(u32be(data.length), typeBytes, data, u32be(crc32(crcIn)));
}

async function zlibDeflate(input) {
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  const reader = cs.readable.getReader();
  writer.write(input);
  writer.close();
  const chunks = [];
  let done, value;
  while ({ done, value } = await reader.read(), !done) chunks.push(value);
  return concatU8(...chunks);
}

/**
 * Encodes an RGBA pixel buffer as a PNG ArrayBuffer.
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} rgba - width*height*4 bytes, row-major
 * @returns {Promise<ArrayBuffer>}
 */
export async function encodePNG(width, height, rgba) {
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width, false);
  dv.setUint32(4, height, false);
  ihdr[8] = 8; ihdr[9] = 6;

  const scanlines = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    scanlines[y * (1 + width * 4)] = 0;
    scanlines.set(
      rgba.subarray(y * width * 4, (y + 1) * width * 4),
      y * (1 + width * 4) + 1,
    );
  }

  const compressed = await zlibDeflate(scanlines);
  return concatU8(
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", new Uint8Array(0)),
  ).buffer;
}

/**
 * Decodes a PNG ArrayBuffer produced by encodePNG (filter-type-0, RGBA only).
 * @param {ArrayBuffer} buffer
 * @returns {Promise<{width:number, height:number, rgba:Uint8Array}>}
 */
export async function decodePNG(buffer) {
  const view = new DataView(buffer);
  let offset = 8;
  let width = 0, height = 0;
  const idatParts = [];

  while (offset < buffer.byteLength) {
    const length = view.getUint32(offset, false);
    const type = String.fromCharCode(
      view.getUint8(offset + 4), view.getUint8(offset + 5),
      view.getUint8(offset + 6), view.getUint8(offset + 7),
    );
    if (type === "IHDR") {
      width = view.getUint32(offset + 8, false);
      height = view.getUint32(offset + 12, false);
    } else if (type === "IDAT") {
      idatParts.push(new Uint8Array(buffer, offset + 8, length));
    } else if (type === "IEND") break;
    offset += 12 + length;
  }

  const totalLen = idatParts.reduce((s, c) => s + c.length, 0);
  const idat = new Uint8Array(totalLen);
  let pos = 0;
  for (const part of idatParts) { idat.set(part, pos); pos += part.length; }

  const ds = new DecompressionStream("deflate");
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  writer.write(idat);
  writer.close();
  const chunks = [];
  let done, value;
  while ({ done, value } = await reader.read(), !done) chunks.push(value);
  const raw = new Uint8Array(height * (1 + width * 4));
  pos = 0;
  for (const c of chunks) { raw.set(c, pos); pos += c.length; }

  const pixels = new Uint8Array(width * height * 4);
  const rowStride = 1 + width * 4;
  for (let y = 0; y < height; y++) {
    pixels.set(
      raw.subarray(y * rowStride + 1, y * rowStride + 1 + width * 4),
      y * width * 4,
    );
  }
  return { width, height, rgba: pixels };
}
