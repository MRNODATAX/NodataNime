import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, "../public/assets");

// CRC32 untuk chunk PNG standar
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0; // filter None
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pointInSegmentDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(px - ax, py - ay);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(px - bx, py - by);
  const b = c1 / c2;
  return Math.hypot(px - (ax + b * vx), py - (ay + b * vy));
}

function pointInTriangle(px, py, x1, y1, x2, y2, x3, y3) {
  const d1 = (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
  const d2 = (px - x3) * (y2 - y3) - (x2 - x3) * (py - y3);
  const d3 = (px - x1) * (y3 - y1) - (x3 - x1) * (py - y1);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function roundedRectSdf(px, py, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(px - cx) - halfW + r;
  const qy = Math.abs(py - cy) - halfH + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function renderBrandIcon(size, maskable = false) {
  const rgba = Buffer.alloc(size * size * 4);
  const scale = maskable ? 0.78 : 0.94;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // Koordinat ternormalisasi ke ruang 64x64 seperti favicon.svg
      const nx = ((x + 0.5) / size - 0.5) / scale * 64 + 32;
      const ny = ((y + 0.5) / size - 0.5) / scale * 64 + 32;

      const idx = (y * size + x) * 4;

      const bgSdf = maskable
        ? -10
        : roundedRectSdf(x + 0.5, y + 0.5, size / 2, size / 2, size * 0.47, size * 0.47, size * 0.22);

      if (bgSdf > 0.8) {
        rgba[idx] = 0;
        rgba[idx + 1] = 0;
        rgba[idx + 2] = 0;
        rgba[idx + 3] = 0;
        continue;
      }

      const bgAlpha = bgSdf > -0.8 ? Math.max(0, Math.min(1, 0.5 - bgSdf / 1.6)) : 1;

      // Latar belakang malam gelap #0B0E17 dengan radial glow merah lembut
      const glow = Math.max(0, 1 - Math.hypot(nx - 32, ny - 28) / 36);
      let r = Math.round(11 + glow * 26);
      let g = Math.round(14 + glow * 6);
      let b = Math.round(23 + glow * 12);

      // Bingkai merah tipis seperti favicon.svg
      if (!maskable) {
        const ringSdf = Math.abs(
          roundedRectSdf(nx, ny, 32, 32, 29.5, 29.5, 13.5)
        );
        if (ringSdf < 1.35) {
          const t = (nx + ny) / 128;
          const rr = Math.round(255 * (1 - t) + 178 * t);
          const gg = Math.round(42 * (1 - t) + 7 * t);
          const bb = Math.round(75 * (1 - t) + 16 * t);
          const mix = Math.max(0, 1 - ringSdf / 1.35) * 0.65;
          r = Math.round(r * (1 - mix) + rr * mix);
          g = Math.round(g * (1 - mix) + gg * mix);
          b = Math.round(b * (1 - mix) + bb * mix);
        }
      }

      // Huruf "N" tebal NodataNime (x: 18..46, y: 17..47)
      const inLeftBar = nx >= 18 && nx <= 25.5 && ny >= 17 && ny <= 47;
      const inRightBar = nx >= 38.5 && nx <= 46 && ny >= 17 && ny <= 47;
      const diagDist = pointInSegmentDist(nx, ny, 21.8, 20.5, 42.2, 43.5);
      const inDiag = diagDist <= 3.9 && ny >= 17 && ny <= 47 && nx >= 18 && nx <= 46;

      if (inLeftBar || inRightBar || inDiag) {
        const t = Math.max(0, Math.min(1, (nx + ny - 34) / 58));
        r = Math.round(255 * (1 - t) + 185 * t);
        g = Math.round(46 * (1 - t) + 9 * t);
        b = Math.round(78 * (1 - t) + 20 * t);
      }

      // Ikon Play putih di tengah (29,25 -> 40,32 -> 29,39)
      if (pointInTriangle(nx, ny, 28.5, 24.5, 40.2, 32, 28.5, 39.5)) {
        r = 255;
        g = 255;
        b = 255;
      }

      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = Math.round(bgAlpha * 255);
    }
  }

  return encodePng(size, size, rgba);
}

fs.mkdirSync(assetsDir, { recursive: true });
fs.writeFileSync(path.join(assetsDir, "apple-touch-icon.png"), renderBrandIcon(180, false));
fs.writeFileSync(path.join(assetsDir, "icon-192.png"), renderBrandIcon(192, false));
fs.writeFileSync(path.join(assetsDir, "icon-512.png"), renderBrandIcon(512, false));
fs.writeFileSync(path.join(assetsDir, "icon-maskable-512.png"), renderBrandIcon(512, true));

console.log("[PWA] Berhasil membuat icon-192.png, icon-512.png, icon-maskable-512.png, dan apple-touch-icon.png");
