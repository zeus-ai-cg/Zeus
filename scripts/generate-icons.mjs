// Generates build/icon.ico (multi-size) and build/icon.png for the desktop app.
// Pure Node (zlib only) — no image libraries required. Run via `npm run desktop:icons`.
//
// Artwork: dark indigo→violet rounded square with a soft glowing orb and a
// faint halo ring — a simple, recognizable "AI" mark.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "build");
fs.mkdirSync(outDir, { recursive: true });

/* PNG encoding (RGBA8) ------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const stride = 1 + size * 4;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/* Artwork -------------------------------------------------------------- */

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = size * 0.22; // rounded-corner radius
  const cx = size / 2;
  const cy = size / 2;
  const orbR = size * 0.3;
  const ringR = size * 0.47;
  const ringW = size * 0.055;

  const top = [26, 18, 74]; // #1a124a
  const bottom = [124, 58, 237]; // #7c3aed
  const ring = [221, 214, 254]; // #ddd6fe

  for (let y = 0; y < size; y++) {
    const t = y / (size - 1);
    for (let x = 0; x < size; x++) {
      // Rounded-rect coverage: distance to boundary, ~1px antialiasing.
      const qx = Math.max(radius - x, x - (size - radius), 0);
      const qy = Math.max(radius - y, y - (size - radius), 0);
      const dist = Math.hypot(qx, qy) - radius;
      const alpha = Math.min(1, Math.max(0, 0.5 - dist));
      if (alpha <= 0) continue;

      const i = (y * size + x) * 4;
      let r = top[0] + (bottom[0] - top[0]) * t;
      let g = top[1] + (bottom[1] - top[1]) * t;
      let b = top[2] + (bottom[2] - top[2]) * t;

      // Glowing orb in the center.
      const d = Math.hypot(x - cx, y - cy);
      if (d < orbR) {
        const w = Math.pow(1 - d / orbR, 1.7) * 0.92;
        r = r + (255 - r) * w;
        g = g + (255 - g) * w;
        b = b + (255 - b) * w;
      }
      // Faint halo ring.
      const ringAmt = Math.max(0, 1 - Math.abs(d - ringR) / (ringW / 2 + 0.75));
      if (ringAmt > 0) {
        const w = ringAmt * 0.5;
        r = r + (ring[0] - r) * w;
        g = g + (ring[1] - g) * w;
        b = b + (ring[2] - b) * w;
      }

      rgba[i] = Math.round(r);
      rgba[i + 1] = Math.round(g);
      rgba[i + 2] = Math.round(b);
      rgba[i + 3] = Math.round(alpha * 255);
    }
  }
  return rgba;
}

/* ICO container (PNG-compressed entries, Vista+) ------------------------ */

function encodeIco(pngs) {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const entries = [];
  const data = [];
  let offset = 6 + count * 16;
  for (const { size, png } of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
    data.push(png);
  }
  return Buffer.concat([header, ...entries, ...data]);
}

/* Main ------------------------------------------------------------------ */

const sizes = [256, 128, 64, 48, 32, 16];
const pngs = sizes.map((size) => ({ size, png: encodePng(size, renderIcon(size)) }));

fs.writeFileSync(path.join(outDir, "icon.ico"), encodeIco(pngs));
fs.writeFileSync(path.join(outDir, "icon.png"), pngs[0].png);
console.log(`Generated build/icon.ico (${sizes.join(", ")} px) and build/icon.png`);
