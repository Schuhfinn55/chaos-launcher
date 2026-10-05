#!/usr/bin/env node
/* ============================================================
 * Chaos Cosmetics API – kleiner Server ohne Abhängigkeiten
 *
 * Über diese API sehen sich Chaos-Spieler gegenseitig: Capes, Hüte und
 * Effekte. Launcher und Chaos Client sprechen dieselbe Schnittstelle.
 *
 *   node server.js                    (Port 8787, Daten in ./data)
 *   PORT=8787 PUBLIC_URL=https://cosmetics.example.de node server.js
 *
 * Authentifizierung ohne Microsoft-Token: Mojang-Join-Handshake.
 *   POST /v1/auth/challenge {uuid,name}            → {serverId}
 *   (Client ruft sessionserver.mojang.com/session/minecraft/join auf)
 *   POST /v1/auth/verify    {uuid,name,serverId}   → {token,expiresAt}
 *   Der Server prüft bei Mojang per hasJoined, dass der Spieler wirklich
 *   der Besitzer der UUID ist. Tokens gelten 24 h.
 *
 * Endpunkte:
 *   GET  /v1/version                         → {apiVersion, cosmeticsVersion}
 *   GET  /v1/cosmetics/:uuid                 → {uuid,name,activeCape,hat,effect,wings,visibility,cosmeticsVersion,updatedAt}
 *   POST /v1/cosmetics/bulk {uuids:[…]}      → [ … ]
 *   PUT  /v1/cosmetics/:uuid (Bearer)        {activeCape, hat, effect, wings, visibility}
 *   POST /v1/capes (Bearer, multipart file+name oder JSON {name,dataBase64}) → RemoteCape
 *   GET  /v1/capes/:id/texture               → PNG
 *
 * Sicherheit: nur PNG mit erlaubten Cape-Maßen (64×32 … 2048×1024, 2:1),
 * max. 4 MB, IDs werden bereinigt, Schreibzugriffe nur mit gültigem Token
 * für die eigene UUID, Rate-Limit pro IP.
 * ============================================================ */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PNG = 4 * 1024 * 1024;
const API_VERSION = "1.1.0";
const COSMETICS_VERSION = 2;

const CAPES_DIR = path.join(DATA_DIR, "capes");
const PLAYERS_FILE = path.join(DATA_DIR, "players.json");
const CAPES_FILE = path.join(DATA_DIR, "capes.json");
fs.mkdirSync(CAPES_DIR, { recursive: true });

/* ---------- Speicher (JSON-Dateien, atomar) ---------- */
function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function saveJson(file, value) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}
const players = loadJson(PLAYERS_FILE, {}); // uuid → { name, activeCape, hat, effect, visibility, updatedAt }
const capes = loadJson(CAPES_FILE, {}); // id → { id, name, owner, sha1, file, version, kind, createdAt }
const challenges = new Map(); // serverId → { uuid, name, at }
const tokens = new Map(); // token → { uuid, name, expiresAt }

/* ---------- Hilfen ---------- */
const sanitizeId = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
const normUuid = (s) => String(s || "").replace(/-/g, "").toLowerCase();
const isUuid = (s) => /^[0-9a-f]{32}$/.test(s);
const now = () => Date.now();

function json(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(data), "Access-Control-Allow-Origin": "*" });
  res.end(data);
}
function readBody(req, limit = MAX_PNG + 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("Body zu groß")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
function pngDimensions(buf) {
  if (buf.length < 33 || buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
function validCape(buf) {
  if (buf.length > MAX_PNG) return false;
  const d = pngDimensions(buf);
  if (!d) return false;
  const fh = d.w / 2, frames = fh > 0 && d.h % fh === 0 ? d.h / fh : 0; // animiert = mehrere 2:1-Frames untereinander
  return d.w % 64 === 0 && d.w >= 64 && d.w <= 2048 && frames >= 1 && frames <= 64 && d.h <= 8192;
}
function sha1(buf) { return crypto.createHash("sha1").update(buf).digest("hex"); }
function capeUrl(id) { return `${PUBLIC_URL}/v1/capes/${id}/texture`; }
function remoteCape(c) { return c ? { id: c.id, name: c.name, url: capeUrl(c.id), sha1: c.sha1, version: c.version || 1, kind: c.kind || "custom", fps: c.fps || 8 } : null; }
function playerView(uuid) {
  const p = players[uuid];
  if (!p) return null;
  return {
    uuid, name: p.name || "",
    activeCape: p.visibility === "none" ? null : remoteCape(capes[p.activeCape]),
    hat: p.visibility === "none" ? "" : p.hat || "",
    effect: p.visibility === "none" ? "" : p.effect || "",
    wings: p.visibility === "none" ? "" : p.wings || "",
    visibility: p.visibility || "everyone",
    cosmeticsVersion: COSMETICS_VERSION,
    updatedAt: p.updatedAt || 0,
  };
}
function bearer(req) {
  const h = req.headers.authorization || "";
  const t = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  const s = tokens.get(t);
  if (!s || s.expiresAt < now()) { if (s) tokens.delete(t); return null; }
  return s;
}
function mojangHasJoined(name, serverId) {
  return new Promise((resolve) => {
    const url = `https://sessionserver.mojang.com/session/minecraft/hasJoined?username=${encodeURIComponent(name)}&serverId=${encodeURIComponent(serverId)}`;
    https.get(url, { headers: { "User-Agent": "chaos-cosmetics-api/" + API_VERSION } }, (r) => {
      let data = "";
      r.on("data", (c) => (data += c));
      r.on("end", () => {
        if (r.statusCode !== 200) return resolve(null);
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    }).on("error", () => resolve(null));
  });
}
/* Multipart (nur Felder "name" und "file") */
function parseMultipart(buf, contentType) {
  const m = /boundary=("?)([^";]+)\1/.exec(contentType || "");
  if (!m) return null;
  const boundary = Buffer.from("--" + m[2]);
  const parts = {};
  let pos = buf.indexOf(boundary);
  while (pos !== -1) {
    const start = pos + boundary.length + 2; // \r\n
    const headEnd = buf.indexOf("\r\n\r\n", start);
    if (headEnd === -1) break;
    const headers = buf.slice(start, headEnd).toString("utf8");
    const next = buf.indexOf(boundary, headEnd + 4);
    if (next === -1) break;
    const body = buf.slice(headEnd + 4, next - 2);
    const nameMatch = /name="([^"]+)"/.exec(headers);
    if (nameMatch) parts[nameMatch[1]] = body;
    pos = next;
    if (buf.slice(next + boundary.length, next + boundary.length + 2).toString() === "--") break;
  }
  return parts;
}

/* ---------- Rate-Limit (einfach, pro IP) ---------- */
const hits = new Map();
function rateLimited(ip, limit = 120) {
  const t = Math.floor(now() / 60000);
  const key = `${ip}:${t}`;
  const n = (hits.get(key) || 0) + 1;
  hits.set(key, n);
  if (hits.size > 5000) for (const k of hits.keys()) if (!k.endsWith(":" + t)) hits.delete(k);
  return n > limit;
}

/* ---------- Routing ---------- */
const server = http.createServer(async (req, res) => {
  const ip = req.socket.remoteAddress || "?";
  if (rateLimited(ip)) return json(res, 429, { error: "Zu viele Anfragen" });
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" });
    return res.end();
  }
  const url = new URL(req.url, "http://x");
  const p = url.pathname.replace(/\/+$/, "") || "/";
  try {
    if (req.method === "GET" && (p === "/" || p === "/v1/version")) {
      return json(res, 200, { name: "Chaos Cosmetics API", apiVersion: API_VERSION, cosmeticsVersion: COSMETICS_VERSION, players: Object.keys(players).length, capes: Object.keys(capes).length });
    }

    /* Auth */
    if (req.method === "POST" && p === "/v1/auth/challenge") {
      const b = JSON.parse((await readBody(req, 4096)).toString("utf8") || "{}");
      const uuid = normUuid(b.uuid), name = String(b.name || "").slice(0, 16);
      if (!isUuid(uuid) || !/^[A-Za-z0-9_]{2,16}$/.test(name)) return json(res, 400, { error: "uuid/name ungültig" });
      const serverId = crypto.randomBytes(20).toString("hex");
      challenges.set(serverId, { uuid, name, at: now() });
      for (const [k, v] of challenges) if (now() - v.at > 5 * 60 * 1000) challenges.delete(k);
      return json(res, 200, { serverId });
    }
    if (req.method === "POST" && p === "/v1/auth/verify") {
      const b = JSON.parse((await readBody(req, 4096)).toString("utf8") || "{}");
      const uuid = normUuid(b.uuid), serverId = String(b.serverId || "");
      const ch = challenges.get(serverId);
      if (!ch || ch.uuid !== uuid) return json(res, 400, { error: "Unbekannte Challenge" });
      challenges.delete(serverId);
      const joined = await mojangHasJoined(ch.name, serverId);
      if (!joined || normUuid(joined.id) !== uuid) return json(res, 401, { error: "Mojang-Prüfung fehlgeschlagen" });
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = Math.floor((now() + TOKEN_TTL_MS) / 1000);
      tokens.set(token, { uuid, name: joined.name || ch.name, expiresAt: now() + TOKEN_TTL_MS });
      if (!players[uuid]) players[uuid] = { name: joined.name || ch.name, activeCape: "", hat: "", effect: "", wings: "", visibility: "everyone", updatedAt: now() };
      else players[uuid].name = joined.name || ch.name;
      saveJson(PLAYERS_FILE, players);
      return json(res, 200, { token, expiresAt });
    }

    /* Cosmetics lesen */
    let m;
    if (req.method === "GET" && (m = /^\/v1\/cosmetics\/([0-9a-fA-F-]{32,36})$/.exec(p))) {
      const uuid = normUuid(m[1]);
      const view = playerView(uuid);
      return view ? json(res, 200, view) : json(res, 404, { error: "Unbekannter Spieler" });
    }
    if (req.method === "POST" && p === "/v1/cosmetics/bulk") {
      const b = JSON.parse((await readBody(req, 64 * 1024)).toString("utf8") || "{}");
      const list = Array.isArray(b.uuids) ? b.uuids.slice(0, 200).map(normUuid).filter(isUuid) : [];
      return json(res, 200, list.map(playerView).filter(Boolean));
    }

    /* Cosmetics setzen */
    if (req.method === "PUT" && (m = /^\/v1\/cosmetics\/([0-9a-fA-F-]{32,36})$/.exec(p))) {
      const s = bearer(req);
      if (!s) return json(res, 401, { error: "Token fehlt oder abgelaufen" });
      const uuid = normUuid(m[1]);
      if (uuid !== s.uuid) return json(res, 403, { error: "Fremde UUID" });
      const b = JSON.parse((await readBody(req, 16 * 1024)).toString("utf8") || "{}");
      const pl = players[uuid] || { name: s.name };
      if ("activeCape" in b) {
        const id = b.activeCape ? sanitizeId(b.activeCape) : "";
        if (id && (!capes[id] || capes[id].owner !== uuid)) return json(res, 400, { error: "Cape gehört nicht zu diesem Spieler" });
        pl.activeCape = id;
      }
      if ("hat" in b) pl.hat = sanitizeId(b.hat);
      if ("effect" in b) pl.effect = sanitizeId(b.effect);
      if ("wings" in b) pl.wings = sanitizeId(b.wings);
      if ("visibility" in b) pl.visibility = ["everyone", "chaos", "none"].includes(b.visibility) ? b.visibility : "everyone";
      pl.name = s.name;
      pl.updatedAt = now();
      players[uuid] = pl;
      saveJson(PLAYERS_FILE, players);
      return json(res, 200, playerView(uuid));
    }

    /* Capes */
    if (req.method === "POST" && p === "/v1/capes") {
      const s = bearer(req);
      if (!s) return json(res, 401, { error: "Token fehlt oder abgelaufen" });
      const body = await readBody(req);
      let name = "Cape", png = null, fps = 8;
      const ct = req.headers["content-type"] || "";
      if (ct.startsWith("multipart/form-data")) {
        const parts = parseMultipart(body, ct);
        if (!parts || !parts.file) return json(res, 400, { error: "file fehlt" });
        png = parts.file;
        if (parts.name) name = parts.name.toString("utf8");
        if (parts.fps && Number(parts.fps.toString("utf8")) > 0) fps = Number(parts.fps.toString("utf8"));
      } else {
        const b = JSON.parse(body.toString("utf8") || "{}");
        name = b.name || name;
        if (Number(b.fps) > 0) fps = Number(b.fps);
        png = Buffer.from(String(b.dataBase64 || "").replace(/^data:[^,]+,/, ""), "base64");
      }
      if (!validCape(png)) return json(res, 400, { error: "Ungültiges Cape-PNG (64×32 oder Vielfache, max. 4 MB)" });
      name = String(name).replace(/[^\w .äöüÄÖÜß-]/g, "").trim().slice(0, 40) || "Cape";
      const hash = sha1(png);
      const existing = Object.values(capes).find((c) => c.owner === s.uuid && c.sha1 === hash);
      if (existing) return json(res, 200, remoteCape(existing));
      const owned = Object.values(capes).filter((c) => c.owner === s.uuid);
      if (owned.length >= 50) return json(res, 400, { error: "Maximal 50 Capes pro Spieler" });
      const id = crypto.randomBytes(8).toString("hex");
      fs.writeFileSync(path.join(CAPES_DIR, id + ".png"), png);
      fps = Math.max(1, Math.min(60, Math.round(fps)));
      capes[id] = { id, name, owner: s.uuid, sha1: hash, file: id + ".png", version: 1, kind: "custom", fps, createdAt: now() };
      saveJson(CAPES_FILE, capes);
      return json(res, 200, remoteCape(capes[id]));
    }
    if (req.method === "GET" && (m = /^\/v1\/capes\/([a-z0-9_-]{1,40})\/texture$/.exec(p))) {
      const c = capes[m[1]];
      if (!c) return json(res, 404, { error: "Cape nicht gefunden" });
      const file = path.join(CAPES_DIR, c.file);
      if (!fs.existsSync(file)) return json(res, 404, { error: "Datei fehlt" });
      const buf = fs.readFileSync(file);
      res.writeHead(200, { "Content-Type": "image/png", "Content-Length": buf.length, "Cache-Control": "public, max-age=3600", ETag: c.sha1, "Access-Control-Allow-Origin": "*" });
      return res.end(buf);
    }

    return json(res, 404, { error: "Nicht gefunden" });
  } catch (e) {
    return json(res, 400, { error: String(e.message || e) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[Chaos Cosmetics API] v${API_VERSION} läuft auf http://${HOST}:${PORT}  (öffentlich: ${PUBLIC_URL})`);
  console.log(`[Chaos Cosmetics API] Daten: ${DATA_DIR} · Spieler: ${Object.keys(players).length} · Capes: ${Object.keys(capes).length}`);
});
