/* Chaos Launcher Website – lädt Release-Feed, News, Cosmetics-API- und Serverstatus. */
(async function () {
  const $ = (id) => document.getElementById(id);
  const fmtBytes = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.round(b / 1024) + " KB");
  const fmtDate = (s) => {
    if (!s) return "";
    const d = new Date(/^\d+$/.test(s) ? Number(s) : s);
    return isNaN(d) ? s : d.toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });
  };

  /* ---------- Releases ---------- */
  try {
    const feed = await fetch("./releases.json", { cache: "no-store" }).then((r) => r.json());
    const ch = feed.channels?.stable || {};
    const l = ch.launcher, c = ch.client;
    // Download-Zähler: läuft über den Website-Worker (/api/downloads, /dl/…); auf statischen Spiegeln Direktlinks
    let counted = false;
    try {
      const d = await fetch("./api/downloads", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
      if (d && typeof d.count === "number") { $("stat-downloads").textContent = String(d.count); counted = true; }
      if (d && typeof d.cosmeticsPlayers === "number") { $("stat-players").textContent = String(d.cosmeticsPlayers); $("stat-players").dataset.done = "1"; }
    } catch (e) { /* statischer Spiegel */ }
    if (!counted) $("stat-downloads").textContent = "–";
    if (l) {
      const dlUrl = counted ? "./dl/launcher" : l.url, msiUrl = counted ? "./dl/msi" : l.msiUrl;
      for (const id of ["btn-download", "btn-download-2"]) { const a = $(id); a.href = dlUrl; if (!counted) a.setAttribute("download", l.fileName || ""); else a.removeAttribute("download"); }
      $("nav-download").href = dlUrl;
      if (counted) document.querySelectorAll("#btn-download, #btn-download-2, #btn-msi, #btn-msi-2").forEach((a) => a.addEventListener("click", () => {
        const el = $("stat-downloads"); const n = parseInt(el.textContent, 10); if (!isNaN(n)) setTimeout(() => (el.textContent = String(n + 1)), 800);
      }));
      $("btn-sub").textContent = `v${l.version} · ${fmtBytes(l.size || 0)} · ${fmtDate(l.publishedAt)}`;
      $("dl-meta").textContent = `Chaos Launcher ${l.version} · ${fmtBytes(l.size || 0)} · ${fmtDate(l.publishedAt)} · Windows x64`;
      $("dl-sha").textContent = l.sha256 || "–";
      if (l.sha256) $("dl-vt").href = "https://www.virustotal.com/gui/search/" + l.sha256;
      $("stat-version").textContent = "v" + l.version;
      for (const id of ["btn-msi", "btn-msi-2"]) { const a = $(id); if (l.msiUrl) { a.href = msiUrl; if (counted) a.removeAttribute("download"); } else a.style.display = "none"; }
    }
    if (c) {
      $("stat-client").textContent = "v" + c.version;
      $("client-version").textContent = c.version;
      $("btn-client").href = c.url; $("btn-client").setAttribute("download", c.fileName || "");
    } else $("btn-client").style.display = "none";

    const hist = feed.history || [];
    $("changelog-list").innerHTML = hist.length ? hist.map((h, i) => `
      <article class="rel">
        <h3>Version ${h.version} ${i === 0 ? '<span class="badge">aktuell</span>' : ""} <small>${fmtDate(h.date)}</small></h3>
        ${h.notes ? `<ul>${String(h.notes).split("\n").filter(Boolean).map((n) => `<li>${esc(n.replace(/^[-•*]\s*/, ""))}</li>`).join("")}</ul>` : ""}
      </article>`).join("") : '<p class="muted">Noch keine Einträge.</p>';
  } catch (e) {
    $("btn-sub").textContent = "Release-Feed nicht erreichbar";
    $("changelog-list").innerHTML = '<p class="muted">Changelog konnte nicht geladen werden.</p>';
  }

  /* ---------- News ---------- */
  try {
    const items = await fetch("./news.json", { cache: "no-store" }).then((r) => r.json());
    const list = Array.isArray(items) ? items : items.items || [];
    $("news-list").innerHTML = list.length ? list.slice(0, 6).map((n) => `
      <article class="news-item">
        <span class="tag">${esc(n.category || "info")}</span>
        <h3>${esc(n.title || "")}</h3>
        <time>${fmtDate(n.date)}</time>
        <p>${esc(n.summary || "")}</p>
        ${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener">Mehr ↗</a>` : ""}
      </article>`).join("") : '<p class="muted">Keine News.</p>';
  } catch (e) {
    $("news-list").innerHTML = '<p class="muted">News konnten nicht geladen werden.</p>';
  }

  /* ---------- Cosmetics-API (Spieler mit Cosmetics) ---------- */
  try {
    if ($("stat-players").dataset.done !== "1") {
      const v = await fetch("https://chaos-cosmetics-api.chaoscraft.workers.dev/v1/version", { cache: "no-store" }).then((r) => r.json());
      $("stat-players").textContent = String(v.players ?? "–");
    }
  } catch (e) {
    if ($("stat-players").dataset.done !== "1") $("stat-players").textContent = "–";
  }

  /* ---------- Serverstatus (Minecraft) ---------- */
  try {
    const st = await fetch("https://api.mcsrvstat.us/3/chaoscraftsmp.duckdns.org", { cache: "no-store" }).then((r) => r.json());
    const pill = $("status-pill");
    if (st.online) {
      pill.classList.add("online");
      $("status-text").textContent = `ChaoscraftSMP online · ${st.players?.online ?? 0} / ${st.players?.max ?? "?"} Spieler`;
      $("stat-online").textContent = `${st.players?.online ?? 0}`;
    } else {
      pill.classList.add("offline");
      $("status-text").textContent = "ChaoscraftSMP derzeit offline";
      $("stat-online").textContent = "0";
    }
  } catch (e) {
    $("status-text").textContent = "ChaoscraftSMP · play: chaoscraftsmp.duckdns.org";
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
})();
