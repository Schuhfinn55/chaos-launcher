/* Chaos Launcher Website – Animationen (Scroll-Reveal, Glut-Partikel, Tilt, Zähler, Nav) */
(function () {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Scroll-Reveal
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
  // dynamisch eingefügte Karten (News/Changelog) ebenfalls animieren
  for (const id of ["news-list", "changelog-list"]) {
    const host = document.getElementById(id);
    if (!host) continue;
    new MutationObserver(() => {
      Array.from(host.children).forEach((n, i) => {
        if (n.classList.contains("skeleton") || n.classList.contains("reveal")) return;
        n.classList.add("reveal"); n.style.setProperty("--d", String(Math.min(5, i))); io.observe(n);
      });
    }).observe(host, { childList: true });
  }

  // Nav schrumpft, Nach-oben-Button
  const nav = document.getElementById("nav"), totop = document.getElementById("totop");
  const onScroll = () => { nav && nav.classList.toggle("scrolled", scrollY > 30); totop && totop.classList.toggle("show", scrollY > 600); };
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  // Mausglow + Karten-Glow
  const glow = document.getElementById("cursor-glow");
  addEventListener("pointermove", (e) => {
    if (glow) { glow.style.left = e.clientX + "px"; glow.style.top = e.clientY + "px"; }
    const t = e.target && e.target.closest ? e.target.closest(".card, .cos, .news-item, .social-card") : null;
    if (t) { const r = t.getBoundingClientRect(); t.style.setProperty("--mx", (e.clientX - r.left) + "px"); t.style.setProperty("--my", (e.clientY - r.top) + "px"); }
  }, { passive: true });

  // 3D-Tilt auf Screenshots
  if (!reduce) document.querySelectorAll(".tilt").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = "perspective(1000px) rotateX(" + (-y * 8).toFixed(2) + "deg) rotateY(" + (x * 10).toFixed(2) + "deg) scale(1.02)";
    });
    el.addEventListener("pointerleave", () => { el.style.transform = ""; });
  });

  // Zähler hochzählen, sobald Werte gesetzt werden
  const countUp = (el) => {
    const target = parseInt(el.textContent, 10);
    if (isNaN(target) || el.dataset.done) return;
    el.dataset.done = "1";
    if (reduce || target <= 0) return;
    const t0 = performance.now(), dur = 1200;
    el.textContent = "0";
    const step = (t) => { const p = Math.min(1, (t - t0) / dur); el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  document.querySelectorAll("[data-count]").forEach((el) => new MutationObserver(() => countUp(el)).observe(el, { childList: true, characterData: true, subtree: true }));

  // Glut-Partikel (rote Funken, die aufsteigen)
  const canvas = document.getElementById("embers");
  if (canvas && !reduce) {
    const ctx = canvas.getContext("2d");
    let W = 0, H = 0;
    const parts = [];
    const resize = () => { W = canvas.width = innerWidth; H = canvas.height = innerHeight; };
    resize(); addEventListener("resize", resize);
    const spawn = (p) => { p.x = Math.random() * W; p.y = H + 10; p.r = 0.8 + Math.random() * 2.2; p.vy = 0.3 + Math.random() * 0.9; p.vx = (Math.random() - 0.5) * 0.4; p.a = 0.3 + Math.random() * 0.6; p.hue = 350 + Math.random() * 20; p.wob = Math.random() * Math.PI * 2; return p; };
    for (let i = 0; i < 70; i++) { const p = spawn({}); p.y = Math.random() * H; parts.push(p); }
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.y -= p.vy; p.wob += 0.02; p.x += p.vx + Math.sin(p.wob) * 0.3;
        if (p.y < -10) spawn(p);
        const fade = Math.min(1, (H - p.y) / 200) * Math.min(1, p.y / 150);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "hsla(" + p.hue + ", 90%, " + (55 + p.r * 8) + "%, " + (p.a * fade) + ")";
        ctx.shadowColor = "hsla(" + p.hue + ", 100%, 60%, " + p.a + ")"; ctx.shadowBlur = 10; ctx.fill();
      }
      requestAnimationFrame(draw);
    };
    draw();
  }
})();
