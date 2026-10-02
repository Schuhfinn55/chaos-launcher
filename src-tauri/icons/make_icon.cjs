// Erzeugt ein einfaches Onyx-Icon (32x32, Cyan-Verlauf) als PNG.
// Keine externen Abhängigkeiten - reiner Node.js-PNG-Encoder.
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

const W = 512, H = 512;
const pixels = Buffer.alloc(W * H * 4);

// Onyx-Cyan-Verlauf + facettierter Edelstein
function mix(a, b, t) { return Math.round(a + (b - a) * t); }
const c1 = [6, 95, 122];     // #065F7A
const c2 = [8, 145, 178];    // #0891B2
const c3 = [34, 211, 238];   // #22D3EE

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    // Edelstein-Form: Raute
    const cx = W / 2, cy = H / 2;
    const dx = Math.abs(x - cx) / (W / 2);
    const dy = Math.abs(y - cy) / (H / 2);
    const inside = (dx + dy) < 0.8;
    const i = (y * W + x) * 4;
    if (inside) {
      const t = (dx + dy) / 1.6;
      let r, g, b;
      if (t < 0.5) {
        const u = t / 0.5;
        r = mix(c1[0], c2[0], u); g = mix(c1[1], c2[1], u); b = mix(c1[2], c2[2], u);
      } else {
        const u = (t - 0.5) / 0.5;
        r = mix(c2[0], c3[0], u); g = mix(c2[1], c3[1], u); b = mix(c2[2], c3[2], u);
      }
      pixels[i] = r; pixels[i+1] = g; pixels[i+2] = b; pixels[i+3] = 255;
    } else {
      // transparenter Hintergrund
      pixels[i] = 0; pixels[i+1] = 0; pixels[i+2] = 0; pixels[i+3] = 0;
    }
  }
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
// Filter-Byte pro Zeile voranstellen
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0;
  pixels.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
}
const idat = zlib.deflateSync(raw);

const png = Buffer.concat([
  sig,
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0)),
]);

fs.writeFileSync(path.join(__dirname, "icon.png"), png);
console.log("icon.png erstellt (" + png.length + " Bytes)");
