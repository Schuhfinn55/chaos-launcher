// Erzeugt icons/icon.ico durch Einbetten des PNGs (modernes ICO-Format).
const fs = require("fs");
const path = require("path");

const png = fs.readFileSync(path.join(__dirname, "icon.png"));
const w = 512, h = 512;

// ICO-Header (6 Bytes): reserved=0, type=1 (icon), count=1
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);

// Directory-Entry (16 Bytes). width/height=0 bedeutet 256+.
const entry = Buffer.alloc(16);
entry[0] = w >= 256 ? 0 : w;     // width
entry[1] = h >= 256 ? 0 : h;     // height
entry[2] = 0;                     // color count
entry[3] = 0;                     // reserved
entry.writeUInt16LE(1, 4);        // planes
entry.writeUInt16LE(32, 6);       // bit count
entry.writeUInt32LE(png.length, 8); // image size
entry.writeUInt32LE(6 + 16, 12);  // offset to image data

const ico = Buffer.concat([header, entry, png]);
fs.writeFileSync(path.join(__dirname, "icon.ico"), ico);
console.log("icon.ico erstellt (" + ico.length + " Bytes)");
