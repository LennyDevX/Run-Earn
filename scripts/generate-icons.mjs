// Generates the Airen app icons (PNG + ICO) with no external dependencies.
//
//   node scripts/generate-icons.mjs
//
// Outputs:
//   src/app/favicon.ico        -> served at /favicon.ico
//   src/app/apple-icon.png     -> 180x180, served at /apple-icon.png
//   public/icon-192.png        -> manifest icon
//   public/icon-512.png        -> manifest icon (also maskable)
//
// The artwork is a 16x16 pixel rendition of the Airen chevron mark, scaled with
// nearest-neighbour sampling to keep the cyan-white edges crisp.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── Pixel mark ───────────────────────────────────────────────────────────────
// W = ice-white core, S = cyan edge, . = midnight background
const PATTERN = [
  "................",
  ".......WS.......",
  "......SWWS......",
  ".....SW..WS.....",
  "....SW....WS....",
  "...SW......WS...",
  "..SW........WS..",
  ".SW..........WS.",
  "SW............WS",
  "WW............WW",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
];

const COLORS = {
  W: [0xf4, 0xfb, 0xff, 0xff], // ice-white core
  S: [0x45, 0xca, 0xff, 0xff], // Airen cyan
  ".": [0x06, 0x0d, 0x17, 0xff], // midnight background
};

const SOURCE = PATTERN.length; // 16

function renderPixels(size) {
  const scale = Math.max(1, Math.floor(size / SOURCE));
  const drawn = scale * SOURCE;
  const offset = Math.floor((size - drawn) / 2);
  // RGBA rows
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(size * 4);
    for (let x = 0; x < size; x++) {
      const sx = Math.floor((x - offset) / scale);
      const sy = Math.floor((y - offset) / scale);
      const cell =
        sx >= 0 && sx < SOURCE && sy >= 0 && sy < SOURCE ? PATTERN[sy][sx] : ".";
      const [r, g, b, a] = COLORS[cell] ?? COLORS["."];
      const i = x * 4;
      row[i] = r;
      row[i + 1] = g;
      row[i + 2] = b;
      row[i + 3] = a;
    }
    rows.push(row);
  }
  return rows;
}

// ── PNG encoding ─────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(size) {
  const rows = renderPixels(size);
  // Raw scanlines: 1 filter byte (0 = None) + RGBA per pixel
  const raw = Buffer.concat(rows.map((row) => Buffer.concat([Buffer.from([0]), row])));

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── ICO encoding (single PNG-compressed entry) ───────────────────────────────
function encodeIco(size) {
  const png = encodePng(size);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count

  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size; // width
  entry[1] = size >= 256 ? 0 : size; // height
  entry[2] = 0; // palette size
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32BE(0, 8);
  entry.writeUInt32LE(png.length, 8); // bytes in resource
  entry.writeUInt32LE(header.length + entry.length, 12); // offset

  return Buffer.concat([header, entry, png]);
}

// ── Emit ─────────────────────────────────────────────────────────────────────
function write(relativePath, buffer) {
  const target = resolve(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, buffer);
  console.log(`  ${relativePath} (${buffer.length} bytes)`);
}

console.log("Generating Airen icons...");
write("src/app/favicon.ico", encodeIco(48));
write("src/app/apple-icon.png", encodePng(180));
write("public/icon-192.png", encodePng(192));
write("public/icon-512.png", encodePng(512));
console.log("Done.");
