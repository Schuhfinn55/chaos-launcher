/* Chaos-Launcher-Website – Worker vor den statischen Assets.
 *   /dl/launcher | /dl/msi | /dl/client  → zählt den Download (KV) und leitet zur aktuellen Datei aus releases.json weiter
 *   /api/downloads                        → { count, real, offset }   (count = offset + echte Downloads)
 * Alles andere kommt aus website/ (Assets). DOWNLOAD_OFFSET in wrangler.toml setzt den Startwert der Anzeige.
 */
const KEY = "stats:downloads";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname.replace(/\/+$/, "");
    const cors = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };

    if (p === "/api/downloads") {
      const real = Number((await env.KV.get(KEY)) || 0);
      const offset = Number(env.DOWNLOAD_OFFSET || 0);
      const count = offset + real;
      // „Spieler mit Cosmetics“: Anteil der Downloads (COSMETICS_SHARE, Standard 0.9), mindestens die echten API-Spieler
      let apiPlayers = 0;
      try { const v = await fetch((env.COSMETICS_API || "https://chaos-cosmetics-api.chaoscraft.workers.dev") + "/v1/version", { cf: { cacheTtl: 60 } }).then((r) => r.json()); apiPlayers = Number(v.players || 0); } catch { /* egal */ }
      const share = Number(env.COSMETICS_SHARE || 0.9);
      const cosmeticsPlayers = Math.max(apiPlayers, Math.round(count * share));
      return new Response(JSON.stringify({ count, real, offset, cosmeticsPlayers, apiPlayers }), { headers: { "Content-Type": "application/json", ...cors } });
    }

    const m = /^\/dl\/(launcher|msi|portable|client)$/.exec(p);
    if (m) {
      const feed = await env.ASSETS.fetch(new Request(url.origin + "/releases.json")).then((r) => r.json()).catch(() => null);
      const s = feed?.channels?.stable || {};
      const target = m[1] === "launcher" ? s.launcher?.url : m[1] === "msi" ? s.launcher?.msiUrl : m[1] === "portable" ? s.launcher?.portableUrl : s.client?.url;
      if (!target) return new Response("Download nicht verfügbar", { status: 404, headers: cors });
      if (m[1] !== "client") {
        // Zähler (KV ist nicht atomar – für eine Anzeige völlig ausreichend)
        const real = Number((await env.KV.get(KEY)) || 0) + 1;
        await env.KV.put(KEY, String(real));
        const day = new Date().toISOString().slice(0, 10);
        const dayKey = "stats:downloads:" + day;
        await env.KV.put(dayKey, String(Number((await env.KV.get(dayKey)) || 0) + 1), { expirationTtl: 60 * 60 * 24 * 400 });
      }
      return Response.redirect(target, 302);
    }

    // Statische Seite mit Sicherheits-Headern (HSTS, CSP, …) – gute Reputation bei Browser-/Sicherheitsscannern
    const res = await env.ASSETS.fetch(request);
    const h = new Headers(res.headers);
    h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    h.set("X-Content-Type-Options", "nosniff");
    h.set("X-Frame-Options", "DENY");
    h.set("Referrer-Policy", "strict-origin-when-cross-origin");
    h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    h.set("Cross-Origin-Opener-Policy", "same-origin");
    if ((h.get("content-type") || "").includes("text/html")) {
      h.set("Content-Security-Policy", "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://chaos-cosmetics-api.chaoscraft.workers.dev https://api.mcsrvstat.us https://api.github.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    }
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  },
};
