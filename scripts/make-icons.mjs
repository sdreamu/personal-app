/**
 * 生成 Windows 应用图标：build/icon.png（512×512）与 build/icon.ico（内嵌 7 个尺寸）。
 *
 * 不引任何图形库：PNG 用 zlib 手写编码，ICO 直接装 PNG（Vista 起合法）。
 * 图形是"蓝底圆角方块 + 三条白色清单行（圆角方块 + 圆角长条）"= 日程 / 待办，
 * 4×4 超采样后按覆盖率降采样，16px 也不糊边。
 *
 * 用法：node scripts/make-icons.mjs   （改了图形就重跑，产物一起提交）
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'build');

/** 所有几何都在 512×512 的逻辑坐标里描述，再缩放到目标尺寸 */
const LOGICAL = 512;
const BG = [0x4a, 0x6c, 0xf7]; // 与 public/favicon.svg 的蓝色一致
const FG = [0xff, 0xff, 0xff];

const BOARD = { x: 0, y: 0, w: 512, h: 512, r: 112 };
const SHAPES = [
  { x: 124, y: 140, w: 56, h: 56, r: 16 },
  { x: 204, y: 144, w: 184, h: 48, r: 24 },
  { x: 124, y: 228, w: 56, h: 56, r: 16 },
  { x: 204, y: 232, w: 152, h: 48, r: 24 },
  { x: 124, y: 316, w: 56, h: 56, r: 16 },
  { x: 204, y: 320, w: 120, h: 48, r: 24 },
];

/** 点是否落在圆角矩形内（圆角按四个角的圆心距离判定）。 */
function insideRoundRect(px, py, rect) {
  const { x, y, w, h, r } = rect;
  if (px < x || py < y || px > x + w || py > y + h) return false;
  const cx = px < x + r ? x + r : px > x + w - r ? x + w - r : px;
  const cy = py < y + r ? y + r : py > y + h - r ? y + h - r : py;
  if (cx === px || cy === py) return true;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

/** 0 = 透明（圆角外），1 = 底色，2 = 白色图形 */
function sample(px, py) {
  if (!insideRoundRect(px, py, BOARD)) return 0;
  for (const shape of SHAPES) {
    if (insideRoundRect(px, py, shape)) return 2;
  }
  return 1;
}

/** 渲染成 RGBA 像素（superSample×superSample 超采样）。 */
function render(size, superSample = 4) {
  const pixels = Buffer.alloc(size * size * 4);
  const total = superSample * superSample;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let covered = 0;
      for (let sy = 0; sy < superSample; sy++) {
        for (let sx = 0; sx < superSample; sx++) {
          const u = ((x + (sx + 0.5) / superSample) / size) * LOGICAL;
          const v = ((y + (sy + 0.5) / superSample) / size) * LOGICAL;
          const kind = sample(u, v);
          if (kind === 0) continue;
          const color = kind === 2 ? FG : BG;
          r += color[0];
          g += color[1];
          b += color[2];
          covered++;
        }
      }
      if (covered === 0) continue; // 全透明，保持 0
      const offset = (y * size + x) * 4;
      pixels[offset] = Math.round(r / covered);
      pixels[offset + 1] = Math.round(g / covered);
      pixels[offset + 2] = Math.round(b / covered);
      pixels[offset + 3] = Math.round((covered / total) * 255);
    }
  }
  return pixels;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

/** 8 bit RGBA 真彩 PNG（无滤波）。 */
function encodePng(size, pixels) {
  const stride = size * 4;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 多尺寸 ICO：目录项 + 每个尺寸一张 PNG。 */
function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(16 * entries.length);
  let offset = header.length + directory.length;
  entries.forEach((entry, index) => {
    const base = index * 16;
    directory[base] = entry.size >= 256 ? 0 : entry.size; // 0 表示 256
    directory[base + 1] = entry.size >= 256 ? 0 : entry.size;
    directory[base + 2] = 0; // 调色板数
    directory[base + 3] = 0; // reserved
    directory.writeUInt16LE(1, base + 4); // color planes
    directory.writeUInt16LE(32, base + 6); // bits per pixel
    directory.writeUInt32BE(0, base + 8);
    directory.writeUInt32LE(entry.png.length, base + 8);
    directory.writeUInt32LE(offset, base + 12);
    offset += entry.png.length;
  });

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.png)]);
}

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

mkdirSync(OUT_DIR, { recursive: true });

// Windows 任务栏 / 资源管理器小图标的抗锯齿在 16px 下几乎没用（超采样反而糊），
// 小尺寸降一档采样；大尺寸用 4×4。
const pngFor = (size) => encodePng(size, render(size, size <= 32 ? 2 : 4));

writeFileSync(join(OUT_DIR, 'icon.png'), pngFor(512));
writeFileSync(
  join(OUT_DIR, 'icon.ico'),
  encodeIco(ICO_SIZES.map((size) => ({ size, png: pngFor(size) }))),
);

console.log('build/icon.png 512x512');
console.log('build/icon.ico ' + ICO_SIZES.join('/'));
