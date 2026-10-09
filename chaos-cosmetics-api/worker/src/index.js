/* ============================================================
 * Chaos Cosmetics API – Cloudflare Worker (kostenlos, ohne eigenen Server)
 *
 * Gleiche Schnittstelle wie server.js (Node), aber als Worker mit KV-Speicher:
 *   GET  /v1/version
 *   POST /v1/auth/challenge {uuid,name}            → {serverId}
 *   POST /v1/auth/verify    {uuid,name,serverId}   → {token,expiresAt}
 *   GET  /v1/cosmetics/:uuid
 *   POST /v1/cosmetics/bulk {uuids:[…]}
 *   PUT  /v1/cosmetics/:uuid (Bearer)  {activeCape, hat, effect, wings, visibility}
 *   POST /v1/capes (Bearer, multipart file+name oder JSON {name,dataBase64})
 *   GET  /v1/capes/:id/texture
 *
 * KV-Schlüssel: player:<uuid>, cape:<id>, capepng:<id>, owner:<uuid> (Cape-IDs),
 * chal:<serverId> (TTL 5 min), tok:<token> (TTL 24 h).
 * Deploy: npx wrangler deploy (siehe wrangler.toml)
 * ============================================================ */

const API_VERSION = "1.6.0";
const COSMETICS_VERSION = 2;
const TOKEN_TTL_S = 24 * 60 * 60;
const MAX_PNG = 4 * 1024 * 1024;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" };

const sanitizeId = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
const normUuid = (s) => String(s || "").replace(/-/g, "").toLowerCase();
const isUuid = (s) => /^[0-9a-f]{32}$/.test(s);
const now = () => Date.now();

function json(code, body, extra = {}) {
  return new Response(JSON.stringify(body), { status: code, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS, ...extra } });
}
function hex(bytes) { return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
/* ---------- Zustandslose Auth (HMAC) – KV ist nur „eventually consistent“, deshalb keine Challenge/Token-Keys ---------- */
const enc = new TextEncoder();
async function hmacHex(env, data) {
  const secret = env.SECRET || "chaos-cosmetics-default-secret-change-me";
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}
const b64u = (s) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uDecode = (s) => atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
/** serverId = nonce(8) + ts(8, Sekunden hex) + hmac(24) = 40 Hex-Zeichen (wie ein Vanilla-Server-Hash). */
async function makeChallenge(env, uuid, name) {
  const nonce = randomHex(4), ts = Math.floor(now() / 1000).toString(16).padStart(8, "0");
  const mac = (await hmacHex(env, `chal|${uuid}|${name.toLowerCase()}|${nonce}|${ts}`)).slice(0, 24);
  return nonce + ts + mac;
}
async function checkChallenge(env, uuid, name, serverId) {
  if (!/^[0-9a-f]{40}$/.test(serverId)) return false;
  const nonce = serverId.slice(0, 8), ts = serverId.slice(8, 16), mac = serverId.slice(16);
  const age = Math.floor(now() / 1000) - parseInt(ts, 16);
  if (!(age >= -60 && age <= 600)) return false;
  const expect = (await hmacHex(env, `chal|${uuid}|${name.toLowerCase()}|${nonce}|${ts}`)).slice(0, 24);
  return expect === mac;
}
async function makeToken(env, uuid, name, expiresAtMs) {
  const payload = b64u(JSON.stringify({ u: uuid, n: name, e: expiresAtMs }));
  return payload + "." + (await hmacHex(env, "tok|" + payload)).slice(0, 32);
}
async function parseToken(env, token) {
  const i = token.indexOf(".");
  if (i <= 0) return null;
  const payload = token.slice(0, i), mac = token.slice(i + 1);
  if ((await hmacHex(env, "tok|" + payload)).slice(0, 32) !== mac) return null;
  try {
    const o = JSON.parse(b64uDecode(payload));
    if (!isUuid(o.u) || typeof o.e !== "number" || o.e < now()) return null;
    return { uuid: o.u, name: String(o.n || ""), expiresAt: o.e };
  } catch { return null; }
}
function randomHex(n) { const b = new Uint8Array(n); crypto.getRandomValues(b); return hex(b); }
async function sha1(buf) { return hex(await crypto.subtle.digest("SHA-1", buf)); }
function pngDimensions(u8) {
  if (u8.length < 33 || u8[0] !== 0x89 || u8[1] !== 0x50 || u8[2] !== 0x4e || u8[3] !== 0x47) return null;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  return { w: dv.getUint32(16), h: dv.getUint32(20) };
}
function validCape(u8) {
  if (!u8 || u8.length > MAX_PNG) return false;
  const d = pngDimensions(u8);
  if (!d) return false;
  const fh = d.w / 2, frames = fh > 0 && d.h % fh === 0 ? d.h / fh : 0; // animiert = mehrere 2:1-Frames untereinander
  return d.w % 64 === 0 && d.w >= 64 && d.w <= 2048 && frames >= 1 && frames <= 64 && d.h <= 8192;
}
function base64ToBytes(s) {
  const bin = atob(String(s || "").replace(/^data:[^,]+,/, "").replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ---------- Mojang-Spielerzertifikate (offline prüfbar – Mojang blockt Cloudflare) ----------
 * Quelle: https://api.minecraftservices.com/publickeys → playerCertificateKeys (RSA-4096, SPKI, base64).
 * Mojang signiert pro Spieler (uuid, expiresAt, publicKey) mit SHA1withRSA; der Launcher signiert damit
 * unsere Challenge (SHA256withRSA). So ist der UUID-Besitz ohne Mojang-Aufruf aus dem Worker beweisbar. */
const MOJANG_PLAYER_CERT_KEYS = [
  "MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAylB4B6m5lz7jwrcFz6Fd/fnfUhcvlxsTSn5kIK/2aGG1C3kMy4VjhwlxF6BFUSnfxhNswPjh3ZitkBxEAFY25uzkJFRwHwVA9mdwjashXILtR6OqdLXXFVyUPIURLOSWqGNBtb08EN5fMnG8iFLgEJIBMxs9BvF3s3/FhuHyPKiVTZmXY0WY4ZyYqvoKR+XjaTRPPvBsDa4WI2u1zxXMeHlodT3lnCzVvyOYBLXL6CJgByuOxccJ8hnXfF9yY4F0aeL080Jz/3+EBNG8RO4ByhtBf4Ny8NQ6stWsjfeUIvH7bU/4zCYcYOq4WrInXHqS8qruDmIl7P5XXGcabuzQstPf/h2CRAUpP/PlHXcMlvewjmGU6MfDK+lifScNYwjPxRo4nKTGFZf/0aqHCh/EAsQyLKrOIYRE0lDG3bzBh8ogIMLAugsAfBb6M3mqCqKaTMAf/VAjh5FFJnjS+7bE+bZEV0qwax1CEoPPJL1fIQjOS8zj086gjpGRCtSy9+bTPTfTR/SJ+VUB5G2IeCItkNHpJX2ygojFZ9n5Fnj7R9ZnOM+L8nyIjPu3aePvtcrXlyLhH/hvOfIOjPxOlqW+O5QwSFP4OEcyLAUgDdUgyW36Z5mB285uKW/ighzZsOTevVUG2QwDItObIV6i8RCxFbN2oDHyPaO5j1tTaBNyVt8CAwEAAQ==",
  "MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAt4t9NPuu7cktclnaH7eZj0omkLcJHeLz5MKsyJEntHZ0INtuBjSSul3Pp3pBeJN8k3ADdcdBLUN90bcAi7WsQqTx3Ft363q3W7TbM8j2iTEdp/0uVspoRt/DP1tkaWFs/w2WwUv9jbVoBUzfUc4pSTIxRwdjmqjZQfvjwKNDbOx3IhP2H0WXodbISejPi1wBZqNW4m1rnZAXp/EpUguxA8mobCa4vUCBkyFDyXdl69/wUSJHyCPmgcMJ364OlAhIqtwVPShBZObvrK/f0BYk6ShJD3N7TFDatSYsIIdcTKRknaIm91s+EsMrdB9U4Yw+ZJ/pyCB4S3vk8zfDCnb0DWIxYH3/EMzaxl77djmTmMzi/JDITup5z3jfWtRZmrAhU2/+W5IO5hEpo3/bCS9PXIY5xb41Lmp2ZO8dXKtyD66Chchy0W129n8vPl2GIruOdrxsjZAHnneyAb9jm0uaGaphwnEnuecX/qgHY6ZMtayvLLsPst8PO6R1vufMy8WqjK+j7LnC1krL7CPDg0NEhyQTmw5l+NCNjSlvB1juM9V4PARg0bYCOkGXm7ydRCjSSH8CJXZpwnd5cBB5WKAX3KPzutRgMi/LFwNSMZzFuUyXaYOZPpD259yqph1LmGqegEdDriACVU+dVEONFMm8eIuBofe7ljmsAFKW9BINwK0CAwEAAQ=="
];
function b64ToBytes(b64) { const bin = atob(b64.replace(/[^A-Za-z0-9+/=]/g, "")); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
function uuidBytes(hex32) { const out = new Uint8Array(16); for (let i = 0; i < 16; i++) out[i] = parseInt(hex32.slice(i * 2, i * 2 + 2), 16); return out; }
function i64be(ms) { const out = new Uint8Array(8); let v = BigInt(ms); for (let i = 7; i >= 0; i--) { out[i] = Number(v & 0xffn); v >>= 8n; } return out; }
async function rsaVerify(spkiDer, hash, data, sig) {
  try {
    const key = await crypto.subtle.importKey("spki", spkiDer, { name: "RSASSA-PKCS1-v1_5", hash }, false, ["verify"]);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, data);
  } catch { return false; }
}
/** Prüft Mojangs Signatur über (uuid, expiresAt, publicKey) und die Challenge-Signatur des Spielers. */
async function verifyPlayerCertificate(env, uuid, serverId, publicKeyB64, keySignatureB64, expiresAt, signatureB64) {
  if (!publicKeyB64 || !keySignatureB64 || !signatureB64 || !(expiresAt > now())) return "Zertifikat fehlt oder abgelaufen";
  const pub = b64ToBytes(publicKeyB64), keySig = b64ToBytes(keySignatureB64), sig = b64ToBytes(signatureB64);
  const signed = new Uint8Array(16 + 8 + pub.length);
  signed.set(uuidBytes(uuid), 0); signed.set(i64be(expiresAt), 16); signed.set(pub, 24);
  let mojangOk = false;
  const extra = env.MOJANG_CERT_KEYS ? String(env.MOJANG_CERT_KEYS).split(",") : [];
  for (const k of [...MOJANG_PLAYER_CERT_KEYS, ...extra]) { if (await rsaVerify(b64ToBytes(k), "SHA-1", signed, keySig)) { mojangOk = true; break; } }
  if (!mojangOk) return "Mojang-Zertifikat ungültig";
  if (!(await rsaVerify(pub, "SHA-256", enc.encode(serverId), sig))) return "Challenge-Signatur ungültig";
  return null;
}

/* ---------- Speicher ---------- */
const getJson = async (env, key) => { const v = await env.KV.get(key, "json"); return v ?? null; };
const putJson = (env, key, value, opts) => env.KV.put(key, JSON.stringify(value), opts);
const getPlayer = (env, uuid) => getJson(env, "player:" + uuid);
const putPlayer = (env, uuid, p) => putJson(env, "player:" + uuid, p);
const getCape = (env, id) => getJson(env, "cape:" + id);

function capeUrl(origin, id) { return `${origin}/v1/capes/${id}/texture`; }
function remoteCape(origin, c) { return c ? { id: c.id, name: c.name, url: capeUrl(origin, c.id), sha1: c.sha1, version: c.version || 1, kind: c.kind || "custom", fps: c.fps || 8 } : null; }
/* ---------- Exklusive Wings (nur mit Code) ---------- */
const EXCLUSIVE_WINGS = new Set(["overlord", "celestial"]);
const normCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
function genCode() { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const b = crypto.getRandomValues(new Uint8Array(8)); let s = ""; for (let i = 0; i < 8; i++) s += a[b[i] % a.length]; return "CHAOS" + s.slice(0, 4) + s.slice(4); }
const fmtCode = (c) => c.length === 13 && c.startsWith("CHAOS") ? `CHAOS-${c.slice(5, 9)}-${c.slice(9)}` : c;
function isAdmin(env, request) { const k = request.headers.get("x-admin-key") || ""; return !!env.ADMIN_KEY && k.length > 0 && k === env.ADMIN_KEY; }
function codeView(c) { return { code: fmtCode(c.code), wings: c.wings, maxUses: c.maxUses, uses: c.uses || 0, note: c.note || "", createdAt: c.createdAt, redeemedBy: c.redeemedBy || [] }; }

/* ---------- Freunde & Präsenz ---------- */
const PRESENCE_TTL_MS = 180000;
async function friendsRec(env, uuid) { const r = await getJson(env, "friends:" + uuid); return r && typeof r === "object" ? { friends: r.friends || [], incoming: r.incoming || [], outgoing: r.outgoing || [] } : { friends: [], incoming: [], outgoing: [] }; }
const putFriends = (env, uuid, r) => putJson(env, "friends:" + uuid, r);
const without = (list, uuid) => list.filter((e) => e.uuid !== uuid);
const has = (list, uuid) => list.some((e) => e.uuid === uuid);
async function presenceOf(env, uuid) {
  const pr = await getJson(env, "presence:" + uuid);
  if (!pr || now() - (pr.at || 0) > PRESENCE_TTL_MS) return { state: "offline", server: "", at: pr?.at || 0 };
  return { state: pr.state || "online", server: pr.server || "", at: pr.at };
}
async function friendsView(env, uuid) {
  const r = await friendsRec(env, uuid);
  const friends = await Promise.all(r.friends.map(async (f) => { const [pl, pr] = await Promise.all([getPlayer(env, f.uuid), presenceOf(env, f.uuid)]); return { uuid: f.uuid, name: pl?.name || f.name || "", chaos: !!pl, ...pr }; }));
  friends.sort((a, b) => (a.state === "offline") - (b.state === "offline") || a.name.localeCompare(b.name));
  return { friends, incoming: r.incoming, outgoing: r.outgoing };
}

async function playerView(env, origin, uuid) {
  const p = await getPlayer(env, uuid);
  if (!p) return null;
  const hidden = p.visibility === "none";
  const unlocks = Array.isArray(p.unlocks) ? p.unlocks : [];
  if (p.wings && EXCLUSIVE_WINGS.has(p.wings) && !unlocks.includes(p.wings)) p.wings = ""; // Besitz beim Lesen prüfen
  let cape = !hidden && p.activeCape ? await getCape(env, p.activeCape) : null;
  if (cape && cape.owner !== uuid) cape = null; // Besitz wird beim Lesen geprüft
  return {
    uuid, name: p.name || "",
    activeCape: hidden ? null : remoteCape(origin, cape),
    hat: hidden ? "" : p.hat || "",
    effect: hidden ? "" : p.effect || "",
    wings: hidden ? "" : p.wings || "",
    unlocks,
    visibility: p.visibility || "everyone",
    cosmeticsVersion: COSMETICS_VERSION,
    updatedAt: p.updatedAt || 0,
  };
}
async function bearer(env, request) {
  const h = request.headers.get("authorization") || "";
  const t = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!t || t.length > 512) return null;
  return parseToken(env, t);
}
let lastMojang = { status: 0, body: "", at: 0 };
async function mojangHasJoined(name, serverId) {
  try {
    const r = await fetch(`https://sessionserver.mojang.com/session/minecraft/hasJoined?username=${encodeURIComponent(name)}&serverId=${encodeURIComponent(serverId)}`, { headers: { "User-Agent": "chaos-cosmetics-api/" + API_VERSION, "Accept": "application/json" } });
    lastMojang = { status: r.status, body: r.status === 200 ? "" : (await r.text()).slice(0, 200), at: now() };
    if (r.status !== 200) return null;
    return await r.json();
  } catch (e) { lastMojang = { status: -1, body: String(e), at: now() }; return null; }
}

/* ---------- Rate-Limit (pro Isolate, best effort) ---------- */
const hits = new Map();
function rateLimited(ip, limit = 120) {
  const t = Math.floor(now() / 60000);
  const key = `${ip}:${t}`;
  const n = (hits.get(key) || 0) + 1;
  hits.set(key, n);
  if (hits.size > 5000) for (const k of hits.keys()) if (!k.endsWith(":" + t)) hits.delete(k);
  return n > limit;
}

async function readJson(request, limit) {
  const txt = await request.text();
  if (txt.length > limit) throw new Error("Body zu groß");
  return txt ? JSON.parse(txt) : {};
}

export default {
  async fetch(request, env) {
    const ip = request.headers.get("cf-connecting-ip") || "?";
    if (rateLimited(ip)) return json(429, { error: "Zu viele Anfragen" });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    const origin = url.origin;
    const p = url.pathname.replace(/\/+$/, "") || "/";
    let m;
    try {
      if (request.method === "GET" && (p === "/" || p === "/v1/version")) {
        const [pl, cp] = await Promise.all([env.KV.list({ prefix: "player:", limit: 1000 }), env.KV.list({ prefix: "cape:", limit: 1000 })]);
        return json(200, { name: "Chaos Cosmetics API", apiVersion: API_VERSION, cosmeticsVersion: COSMETICS_VERSION, players: pl.keys.length, capes: cp.keys.length, host: "cloudflare-workers" }, { "Cache-Control": "public, max-age=60" });
      }

      if (request.method === "GET" && p === "/v1/health") {
        // Erreichbarkeit der Mojang-Sessionserver aus dem Worker prüfen (Diagnose)
        let mojang = 0, body = "";
        try { const r = await fetch("https://sessionserver.mojang.com/session/minecraft/hasJoined?username=Notch&serverId=0", { headers: { "User-Agent": "chaos-cosmetics-api/" + API_VERSION } }); mojang = r.status; if (r.status !== 204 && r.status !== 200) body = (await r.text()).slice(0, 200); } catch (e) { mojang = -1; body = String(e); }
        let services = 0;
        try { const r2 = await fetch("https://api.minecraftservices.com/publickeys", { headers: { "User-Agent": "chaos-cosmetics-api/" + API_VERSION } }); services = r2.status; } catch { services = -1; }
        return json(200, { ok: true, mojangStatus: mojang, mojangBody: body, servicesPublicKeysStatus: services, lastVerify: lastMojang, secret: !!env.SECRET });
      }

      /* Auth */
      if (request.method === "POST" && p === "/v1/auth/challenge") {
        const b = await readJson(request, 4096);
        const uuid = normUuid(b.uuid), name = String(b.name || "").slice(0, 16);
        if (!isUuid(uuid) || !/^[A-Za-z0-9_]{2,16}$/.test(name)) return json(400, { error: "uuid/name ungültig" });
        const serverId = await makeChallenge(env, uuid, name);
        return json(200, { serverId });
      }
      if (request.method === "POST" && p === "/v1/auth/verify") {
        const b = await readJson(request, 4096);
        const uuid = normUuid(b.uuid), serverId = String(b.serverId || ""), chName = String(b.name || "").slice(0, 16);
        if (!isUuid(uuid) || !(await checkChallenge(env, uuid, chName, serverId))) return json(400, { error: "Unbekannte oder abgelaufene Challenge" });
        let name = chName;
        if (b.publicKey) {
          // Neuer Weg: Mojang-Spielerzertifikat (offline prüfbar)
          const err = await verifyPlayerCertificate(env, uuid, serverId, String(b.publicKey), String(b.keySignature || ""), Number(b.expiresAt || 0), String(b.signature || ""));
          if (err) return json(401, { error: "Identitätsprüfung fehlgeschlagen: " + err });
        } else {
          // Alter Weg (Sessionserver) – aus Cloudflare meist blockiert
          const joined = await mojangHasJoined(chName, serverId);
          if (!joined || normUuid(joined.id) !== uuid) return json(401, { error: "Mojang-Prüfung fehlgeschlagen (Mojang HTTP " + lastMojang.status + ") – bitte Launcher aktualisieren" });
          name = joined.name || chName;
        }
        const expiresAt = Math.floor(now() / 1000) + TOKEN_TTL_S;
        const token = await makeToken(env, uuid, name, now() + TOKEN_TTL_S * 1000);
        const pl = (await getPlayer(env, uuid)) || { name, activeCape: "", hat: "", effect: "", wings: "", visibility: "everyone", updatedAt: now() };
        pl.name = name;
        await putPlayer(env, uuid, pl);
        await putJson(env, "name:" + name.toLowerCase(), uuid);
        return json(200, { token, expiresAt });
      }

      /* Cosmetics lesen */
      if (request.method === "GET" && (m = /^\/v1\/cosmetics\/([0-9a-fA-F-]{32,36})$/.exec(p))) {
        const view = await playerView(env, origin, normUuid(m[1]));
        return view ? json(200, view, { "Cache-Control": "no-store" }) : json(404, { error: "Unbekannter Spieler" });
      }
      if (request.method === "POST" && p === "/v1/cosmetics/bulk") {
        const b = await readJson(request, 64 * 1024);
        const list = Array.isArray(b.uuids) ? b.uuids.slice(0, 200).map(normUuid).filter(isUuid) : [];
        const views = await Promise.all(list.map((u) => playerView(env, origin, u)));
        return json(200, views.filter(Boolean));
      }

      /* Cosmetics setzen */
      if (request.method === "PUT" && (m = /^\/v1\/cosmetics\/([0-9a-fA-F-]{32,36})$/.exec(p))) {
        const s = await bearer(env, request);
        if (!s) return json(401, { error: "Token fehlt oder abgelaufen" });
        const uuid = normUuid(m[1]);
        if (uuid !== s.uuid) return json(403, { error: "Fremde UUID" });
        const b = await readJson(request, 16 * 1024);
        const pl = (await getPlayer(env, uuid)) || { name: s.name };
        if ("activeCape" in b) {
          // Besitz wird beim Lesen (playerView) geprüft – KV-Schreibvorgänge sind nicht sofort überall sichtbar
          pl.activeCape = b.activeCape ? sanitizeId(b.activeCape) : "";
        }
        if ("hat" in b) pl.hat = sanitizeId(b.hat);
        if ("effect" in b) pl.effect = sanitizeId(b.effect);
        if ("wings" in b) {
          const w = sanitizeId(b.wings);
          if (w && EXCLUSIVE_WINGS.has(w) && !(Array.isArray(pl.unlocks) && pl.unlocks.includes(w))) return json(403, { error: "Diese Wings sind exklusiv – bitte zuerst einen Code einlösen." });
          pl.wings = w;
        }
        if ("visibility" in b) pl.visibility = ["everyone", "chaos", "none"].includes(b.visibility) ? b.visibility : "everyone";
        pl.name = s.name;
        pl.updatedAt = now();
        await putPlayer(env, uuid, pl);
        return json(200, await playerView(env, origin, uuid));
      }

      /* Präsenz (Launcher offen / im Spiel auf Server X) – läuft nach 3 Minuten ohne Heartbeat ab */
      if (request.method === "PUT" && p === "/v1/presence") {
        const s = await bearer(env, request);
        if (!s) return json(401, { error: "Token fehlt oder abgelaufen" });
        const b = await readJson(request, 4 * 1024);
        const state = ["online", "ingame"].includes(b.state) ? b.state : "online";
        const server = String(b.server || "").slice(0, 120);
        await putJson(env, "presence:" + s.uuid, { name: s.name, state, server, at: now() }, { expirationTtl: 600 });
        return json(200, { ok: true });
      }

      /* Emotes: kurzlebig (30 s), Spieler in der Nähe fragen per bulk ab */
      if (request.method === "PUT" && p === "/v1/emote") {
        const s = await bearer(env, request);
        if (!s) return json(401, { error: "Token fehlt oder abgelaufen" });
        const b = await readJson(request, 2 * 1024);
        const id = sanitizeId(b.id);
        if (!id) return json(400, { error: "id fehlt" });
        await putJson(env, "emote:" + s.uuid, { id, at: now() }, { expirationTtl: 60 });
        return json(200, { ok: true });
      }
      if (request.method === "POST" && p === "/v1/emotes/bulk") {
        const b = await readJson(request, 16 * 1024);
        const list = Array.isArray(b.uuids) ? b.uuids.slice(0, 64).map(normUuid).filter(isUuid) : [];
        const out = {};
        await Promise.all(list.map(async (u) => { const e = await getJson(env, "emote:" + u); if (e && now() - e.at < 30000) out[u] = e; }));
        return json(200, out, { "Cache-Control": "no-store" });
      }

      /* Freunde */
      if (p === "/v1/friends" || p.startsWith("/v1/friends/")) {
        const s = await bearer(env, request);
        if (!s) return json(401, { error: "Token fehlt oder abgelaufen" });
        const me = s.uuid;
        if (request.method === "GET" && p === "/v1/friends") return json(200, await friendsView(env, me), { "Cache-Control": "no-store" });
        if (request.method !== "POST") return json(405, { error: "Methode" });
        const b = await readJson(request, 4 * 1024);
        let target = normUuid(b.uuid || "");
        let targetName = String(b.name || "").slice(0, 16);
        if (!isUuid(target) && targetName) { target = (await getJson(env, "name:" + targetName.toLowerCase())) || ""; }
        if (!isUuid(target)) return json(404, { error: "Spieler nicht gefunden – er muss den Chaos Launcher mindestens einmal gestartet haben." });
        if (target === me) return json(400, { error: "Das bist du selbst." });
        const tp = await getPlayer(env, target);
        if (tp?.name) targetName = tp.name;
        const mine = await friendsRec(env, me), theirs = await friendsRec(env, target);
        const meEntry = { uuid: me, name: s.name }, themEntry = { uuid: target, name: targetName };
        const action = p.slice("/v1/friends/".length);
        if (action === "request") {
          if (has(mine.friends, target)) return json(200, { ok: true, already: true });
          if (has(mine.incoming, target)) {
            // Gegenseitig → direkt Freunde
            mine.incoming = without(mine.incoming, target); theirs.outgoing = without(theirs.outgoing, me);
            if (!has(mine.friends, target)) mine.friends.push(themEntry);
            if (!has(theirs.friends, me)) theirs.friends.push(meEntry);
            await putFriends(env, me, mine); await putFriends(env, target, theirs);
            return json(200, { ok: true, accepted: true });
          }
          if (!has(mine.outgoing, target)) mine.outgoing.push(themEntry);
          if (!has(theirs.incoming, me)) theirs.incoming.push(meEntry);
          await putFriends(env, me, mine); await putFriends(env, target, theirs);
          return json(200, { ok: true, pending: true });
        }
        if (action === "accept") {
          if (!has(mine.incoming, target)) return json(404, { error: "Keine Anfrage von diesem Spieler." });
          mine.incoming = without(mine.incoming, target); theirs.outgoing = without(theirs.outgoing, me);
          if (!has(mine.friends, target)) mine.friends.push(themEntry);
          if (!has(theirs.friends, me)) theirs.friends.push(meEntry);
          await putFriends(env, me, mine); await putFriends(env, target, theirs);
          return json(200, { ok: true });
        }
        if (action === "decline") {
          mine.incoming = without(mine.incoming, target); mine.outgoing = without(mine.outgoing, target);
          theirs.outgoing = without(theirs.outgoing, me); theirs.incoming = without(theirs.incoming, me);
          await putFriends(env, me, mine); await putFriends(env, target, theirs);
          return json(200, { ok: true });
        }
        if (action === "remove") {
          mine.friends = without(mine.friends, target); theirs.friends = without(theirs.friends, me);
          await putFriends(env, me, mine); await putFriends(env, target, theirs);
          return json(200, { ok: true });
        }
        return json(404, { error: "unbekannt" });
      }

      /* Eigener Datensatz (inkl. Freischaltungen) */
      if (request.method === "GET" && p === "/v1/me") {
        const s = await bearer(env, request);
        if (!s) return json(401, { error: "Token fehlt oder abgelaufen" });
        const view = await playerView(env, origin, s.uuid);
        return json(200, view || { uuid: s.uuid, name: s.name, unlocks: [] }, { "Cache-Control": "no-store" });
      }

      /* Code einlösen → exklusive Wings freischalten */
      if (request.method === "POST" && p === "/v1/codes/redeem") {
        const s = await bearer(env, request);
        if (!s) return json(401, { error: "Token fehlt oder abgelaufen" });
        const b = await readJson(request, 4 * 1024);
        const code = normCode(b.code);
        if (code.length < 6) return json(400, { error: "Ungültiger Code" });
        const rec = await getJson(env, "code:" + code);
        if (!rec) return json(404, { error: "Dieser Code existiert nicht." });
        const pl = (await getPlayer(env, s.uuid)) || { name: s.name, activeCape: "", hat: "", effect: "", wings: "", visibility: "everyone", updatedAt: now() };
        pl.unlocks = Array.isArray(pl.unlocks) ? pl.unlocks : [];
        if (pl.unlocks.includes(rec.wings)) return json(200, { ok: true, already: true, unlocked: rec.wings, unlocks: pl.unlocks });
        if (rec.maxUses > 0 && (rec.uses || 0) >= rec.maxUses) return json(410, { error: "Dieser Code wurde bereits vollständig eingelöst." });
        rec.uses = (rec.uses || 0) + 1;
        rec.redeemedBy = [...(rec.redeemedBy || []), { uuid: s.uuid, name: s.name, at: now() }].slice(-200);
        await putJson(env, "code:" + code, rec);
        pl.unlocks.push(rec.wings);
        pl.updatedAt = now();
        await putPlayer(env, s.uuid, pl);
        return json(200, { ok: true, unlocked: rec.wings, unlocks: pl.unlocks });
      }

      /* Admin: Codes verwalten (Header X-Admin-Key) */
      if (p === "/v1/admin/codes" || p.startsWith("/v1/admin/codes/")) {
        if (!isAdmin(env, request)) return json(403, { error: "Kein Admin-Zugriff" });
        if (request.method === "GET" && p === "/v1/admin/codes") {
          // KV-list ist nur eventually consistent → zusätzlich Index-Schlüssel (sofort lesbar nach dem Anlegen)
          const [l, idx] = await Promise.all([env.KV.list({ prefix: "code:", limit: 1000 }), getJson(env, "codes:index")]);
          const names = new Set([...l.keys.map((k) => k.name), ...((idx || []).map((c) => "code:" + c))]);
          const items = (await Promise.all([...names].map((k) => getJson(env, k)))).filter(Boolean).map(codeView).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          return json(200, { codes: items, exclusiveWings: [...EXCLUSIVE_WINGS] });
        }
        if (request.method === "POST" && p === "/v1/admin/codes") {
          const b = await readJson(request, 4 * 1024);
          const wings = sanitizeId(b.wings);
          if (!wings) return json(400, { error: "wings fehlt" });
          let code = normCode(b.code) || genCode();
          if (code.length < 6 || code.length > 32) return json(400, { error: "Code muss 6–32 Zeichen (Buchstaben/Zahlen) haben" });
          if (await getJson(env, "code:" + code)) return json(409, { error: "Code existiert bereits" });
          const rec = { code, wings, maxUses: Math.max(0, Math.min(100000, Number(b.maxUses) || 0)), uses: 0, note: String(b.note || "").slice(0, 80), createdAt: now(), redeemedBy: [] };
          await putJson(env, "code:" + code, rec);
          const idx = (await getJson(env, "codes:index")) || [];
          if (!idx.includes(code)) await putJson(env, "codes:index", [...idx, code].slice(-2000));
          return json(200, codeView(rec));
        }
        const dm = /^\/v1\/admin\/codes\/([A-Za-z0-9-]+)$/.exec(p);
        if (request.method === "DELETE" && dm) {
          const c = normCode(dm[1]);
          await env.KV.delete("code:" + c);
          const idx = (await getJson(env, "codes:index")) || [];
          await putJson(env, "codes:index", idx.filter((x) => x !== c));
          return json(200, { ok: true });
        }
        return json(404, { error: "unbekannt" });
      }

      /* Capes */
      if (request.method === "POST" && p === "/v1/capes") {
        const s = await bearer(env, request);
        if (!s) return json(401, { error: "Token fehlt oder abgelaufen" });
        const len = Number(request.headers.get("content-length") || 0);
        if (len > MAX_PNG * 1.5) return json(413, { error: "Datei zu groß" });
        let name = "Cape", png = null, fps = 8;
        const ct = request.headers.get("content-type") || "";
        if (ct.startsWith("multipart/form-data")) {
          const fd = await request.formData();
          const file = fd.get("file");
          if (!file || typeof file === "string") return json(400, { error: "file fehlt" });
          png = new Uint8Array(await file.arrayBuffer());
          const n = fd.get("name");
          if (typeof n === "string") name = n;
          const f = fd.get("fps");
          if (typeof f === "string" && Number(f) > 0) fps = Number(f);
        } else {
          const b = await readJson(request, MAX_PNG * 1.5);
          name = b.name || name;
          if (Number(b.fps) > 0) fps = Number(b.fps);
          png = base64ToBytes(b.dataBase64);
        }
        if (!validCape(png)) return json(400, { error: "Ungültiges Cape-PNG (64×32 oder Vielfache, max. 4 MB)" });
        name = String(name).replace(/[^\w .äöüÄÖÜß-]/g, "").trim().slice(0, 40) || "Cape";
        const hash = await sha1(png);
        const owned = (await getJson(env, "owner:" + s.uuid)) || [];
        for (const id of owned) {
          const c = await getCape(env, id);
          if (c && c.sha1 === hash && (c.fps || 8) === fps) return json(200, remoteCape(origin, c));
        }
        if (owned.length >= 100) return json(400, { error: "Maximal 100 Capes pro Spieler" });
        const id = randomHex(8);
        fps = Math.max(1, Math.min(60, Math.round(fps)));
        const cape = { id, name, owner: s.uuid, sha1: hash, version: 1, kind: "custom", fps, createdAt: now() };
        await env.KV.put("capepng:" + id, png);
        await putJson(env, "cape:" + id, cape);
        await putJson(env, "owner:" + s.uuid, [...owned, id]);
        return json(200, remoteCape(origin, cape));
      }
      if (request.method === "GET" && (m = /^\/v1\/capes\/([a-z0-9_-]{1,40})\/texture$/.exec(p))) {
        const c = await getCape(env, m[1]);
        if (!c) return json(404, { error: "Cape nicht gefunden" });
        const png = await env.KV.get("capepng:" + m[1], "arrayBuffer");
        if (!png) return json(404, { error: "Datei fehlt" });
        return new Response(png, { status: 200, headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600", ETag: c.sha1, ...CORS } });
      }

      return json(404, { error: "Nicht gefunden" });
    } catch (e) {
      return json(400, { error: String((e && e.message) || e) });
    }
  },
};
