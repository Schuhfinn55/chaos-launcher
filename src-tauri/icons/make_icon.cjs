// Erzeugt das Chaos-Launcher-Icon (512x512) als PNG.
// Keine externen Abhängigkeiten - reiner Node.js-PNG-Encoder.
// Motiv: abgerundetes, sehr dunkles Quadrat, darauf ein rotes "C"
// als aufgebrochener Ring mit einem Riss (Chaos-Splitter) und Glow.
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

const W = 512, H = 512;
const px = Buffer.alloc(W * H * 4);

const bg = [12, 10, 12];          // #0c0a0c
const bgEdge = [22, 16, 19];      // #161013
const deep = [127, 29, 29];       // #7f1d1d
const red = [225, 29, 46];        // #e11d2e
const hot = [255, 92, 108];       // #ff5c6c
const white = [255, 214, 218];    // #ffd6da

function mix(a, b, t) { return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function smooth(edge0, edge1, x) { const t = clamp((x - edge0) / (edge1 - edge0), 0, 1); return t * t * (3 - 2 * t); }

// Abgerundetes Rechteck: signed distance
function sdRoundBox(x, y, hw, hh, r) {
  const qx = Math.abs(x) - hw + r, qy = Math.abs(y) - hh + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

const cx = W / 2, cy = H / 2;
const R_OUT = 170, R_IN = 108;           // Ring-Radien
const gapCenter = 0;                      // Öffnung des "C" zeigt nach rechts
const gapHalf = Math.PI / 4.2;            // halbe Öffnungsweite

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const dx = x - cx, dy = y - cy;
    const dBox = sdRoundBox(dx, dy, 236, 236, 96);
    const boxA = 1 - smooth(-1.5, 1.5, dBox);
    if (boxA <= 0) { px[i + 3] = 0; continue; }

    // Hintergrund: leichter radialer Verlauf
    const dist = Math.hypot(dx, dy);
    let col = mix(bgEdge, bg, clamp(dist / 300, 0, 1));
    // Roter Schimmer innen
    const glow = Math.exp(-Math.pow((dist - 140) / 110, 2)) * 0.22;
    col = mix(col, deep, glow);

    // Ring ("C")
    const ang = Math.atan2(dy, dx);
    let da = Math.abs(ang - gapCenter);
    if (da > Math.PI) da = 2 * Math.PI - da;
    const inGap = da < gapHalf;
    const ringMask = (1 - smooth(R_OUT - 2, R_OUT + 2, dist)) * smooth(R_IN - 2, R_IN + 2, dist);
    // Weiche Kanten an der Öffnung
    const gapSoft = smooth(gapHalf - 0.03, gapHalf + 0.03, da);
    let ring = ringMask * (inGap ? gapSoft : 1);

    // Riss (Chaos-Splitter): schräger Spalt links oben durch den Ring
    const crackU = (dx * 0.70 + dy * -0.71);  // Achse
    const crackV = (dx * 0.71 + dy * 0.70);
    const crackHere = crackV < -40 && Math.abs(crackU + crackV * 0.12 + 20) < 7 + Math.max(0, (-crackV - 40) * 0.02);
    if (crackHere) ring *= 0.15;

    if (ring > 0.001) {
      // Farbverlauf entlang des Rings: deep → red → hot
      const t = (ang + Math.PI) / (2 * Math.PI);
      const sweep = Math.sin(t * Math.PI * 2 + 0.6) * 0.5 + 0.5;
      let rc = mix(deep, red, clamp(sweep * 1.4, 0, 1));
      rc = mix(rc, hot, Math.pow(sweep, 3) * 0.7);
      // innere Lichtkante
      const edgeHi = 1 - smooth(R_IN + 2, R_IN + 14, dist);
      rc = mix(rc, white, edgeHi * 0.35);
      col = mix(col, rc, ring);
    }

    // Außenglow des Rings
    const outer = Math.exp(-Math.pow((dist - R_OUT) / 26, 2)) * (inGap ? 0.2 : 0.55);
    col = mix(col, red, outer * (ring > 0.5 ? 0 : 1) * 0.6);

    px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2];
    px[i + 3] = Math.round(255 * boxA);
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
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0;
  px.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
}
const png = Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
fs.writeFileSync(path.join(__dirname, "icon.png"), png);
console.log("icon.png erstellt (" + png.length + " Bytes)");
