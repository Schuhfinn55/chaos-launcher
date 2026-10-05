#!/usr/bin/env python3
"""
Chaos Launcher – Release & Website veröffentlichen

    python website/publish.py --notes "Text"          # GitHub-Release + GitHub Pages (Standard)
    python website/publish.py --notes "Text" --server # zusätzlich per SSH auf den eigenen Server
    python website/publish.py --site-only             # nur Website (Pages / Server), kein Release

Ablauf (GitHub):
  1. Version aus package.json, Builds aus src-tauri/target/release/bundle, Client-JAR aus
     src-tauri/resources → SHA-256.
  2. GitHub-Release v<version> im Repo (gh CLI) anlegen/aktualisieren und Setup, MSI, JAR,
     SHA256SUMS hochladen.
  3. website/releases.json (Feed für Launcher-Updates + Website) mit den Release-Asset-URLs
     schreiben, History ergänzen.
  4. Website (website/) auf Cloudflare deployen (website-deploy/wrangler.toml →
     https://chaos-launcher.chaoscraft.workers.dev) und in den Branch gh-pages pushen
     (Spiegel: https://schuhfinn55.github.io/chaos-launcher).
Der Launcher liest zuerst https://chaoslauncher.duckdns.org/releases.json und fällt auf den
GitHub-Pages-Spiegel zurück – beide Feeds sind identisch.
"""
import argparse, hashlib, json, os, subprocess, sys, zipfile, datetime, shutil, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, "website")
BUNDLE = os.path.join(ROOT, "src-tauri", "target", "release", "bundle")
SSH_HOST = os.environ.get("CHAOS_SSH_HOST", "mc")
REMOTE_ROOT = "/var/www/chaoslauncher"
PUBLIC = "https://chaoslauncher.duckdns.org"
GH_REPO = os.environ.get("CHAOS_GH_REPO", "Schuhfinn55/chaos-launcher")
PAGES_URL = "https://schuhfinn55.github.io/chaos-launcher"
GH = shutil.which("gh") or r"C:\Program Files\GitHub CLI\gh.exe"
# Zwischenordner im Projekt (kein %TEMP%: unter MSIX-Virtualisierung sehen Kindprozesse wie gh/git ihn sonst nicht)
STAGING = os.path.join(ROOT, "src-tauri", "target", "publish-staging")


def staging_dir(name):
    d = os.path.join(STAGING, name)
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d, exist_ok=True)
    return d
SITE_FILES = ["index.html", "style.css", "animations.css", "app.js", "animations.js", "licenses.html", "releases.json", "news.json", "SHA256SUMS", ".nojekyll"]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def jar_version(jar):
    with zipfile.ZipFile(jar) as z:
        return json.loads(z.read("fabric.mod.json"))["version"]


def run(cmd, check=True, **kw):
    print("$", " ".join(str(c) for c in cmd))
    return subprocess.run(cmd, check=check, text=True, **kw)


def ssh(cmd, check=True):
    return subprocess.run(["ssh", "-o", "BatchMode=yes", SSH_HOST, cmd], check=check, capture_output=True, text=True)


def gh(*args, check=True, capture=False):
    return run([GH, *args], check=check, capture_output=capture)


def collect_site():
    files = []
    for name in SITE_FILES:
        p = os.path.join(SITE, name)
        if os.path.exists(p):
            files.append((p, name))
    for name in os.listdir(os.path.join(SITE, "assets")):
        files.append((os.path.join(SITE, "assets", name), f"assets/{name}"))
    return files


def publish_pages(files):
    """Website als Branch gh-pages pushen (eigenes Temp-Repo, force-push)."""
    origin = subprocess.run(["git", "-C", ROOT, "remote", "get-url", "origin"], capture_output=True, text=True, check=True).stdout.strip()
    tmp = staging_dir("pages")
    if True:
        for local, rel in files:
            dest = os.path.join(tmp, rel)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            shutil.copy2(local, dest)
        g = lambda *a: subprocess.run(["git", "-C", tmp, *a], check=True, capture_output=True, text=True)
        g("init", "-q", "-b", "gh-pages")
        g("config", "user.email", "release@chaoslauncher")
        g("config", "user.name", "Chaos Release")
        g("add", "-A")
        g("commit", "-q", "-m", f"Website {datetime.date.today().isoformat()}")
        g("push", "-q", "--force", origin, "gh-pages:gh-pages")
    # Pages aktivieren (idempotent)
    r = gh("api", f"repos/{GH_REPO}/pages", check=False, capture=True)
    if r.returncode != 0:
        gh("api", "-X", "POST", f"repos/{GH_REPO}/pages", "-f", "source[branch]=gh-pages", "-f", "source[path]=/", check=False, capture=True)
    print(f"GitHub Pages: {PAGES_URL}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--site-only", action="store_true")
    ap.add_argument("--notes", default="")
    ap.add_argument("--client-notes", default="")
    ap.add_argument("--notes-file", default="", help="Release-Notes aus UTF-8-Datei (umgeht Konsolen-Encoding)")
    ap.add_argument("--client-notes-file", default="")
    ap.add_argument("--server", action="store_true", help="zusätzlich per SSH auf den eigenen Server laden")
    ap.add_argument("--no-github", action="store_true", help="kein GitHub-Release/Pages")
    ap.add_argument("--no-cloudflare", action="store_true", help="Website nicht auf Cloudflare deployen")
    ap.add_argument("--client-only", action="store_true", help="nur die Chaos-Client-JAR in das bestehende Launcher-Release laden und den Feed aktualisieren")
    args = ap.parse_args()
    if args.notes_file:
        args.notes = open(args.notes_file, encoding="utf-8").read().strip()
    if args.client_notes_file:
        args.client_notes = open(args.client_notes_file, encoding="utf-8").read().strip()

    pkg = json.load(open(os.path.join(ROOT, "package.json"), encoding="utf-8"))
    version = pkg["version"]
    tag = f"v{version}"
    today = datetime.date.today().isoformat()
    feed_path = os.path.join(SITE, "releases.json")
    feed = json.load(open(feed_path, encoding="utf-8")) if os.path.exists(feed_path) else {"channels": {"stable": {}}, "history": []}
    use_github = not args.no_github

    def dl_url(name):
        return f"https://github.com/{GH_REPO}/releases/download/{tag}/{name}" if use_github else f"{PUBLIC}/download/{name}"

    assets = []  # (lokal, Dateiname)
    if args.client_only:
        jar = os.path.join(ROOT, "src-tauri", "resources", "chaos-client.jar")
        cv = jar_version(jar)
        jar_name = f"chaos-client-{cv}.jar"
        feed["channels"]["stable"]["client"] = {
            "version": cv, "fileName": jar_name, "url": dl_url(jar_name),
            "sha256": sha256(jar), "size": os.path.getsize(jar), "publishedAt": today,
            "notes": args.client_notes or feed["channels"]["stable"].get("client", {}).get("notes", ""),
        }
        feed["updatedAt"] = today
        json.dump(feed, open(feed_path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
        if use_github:
            tmp = staging_dir("release")
            dest = os.path.join(tmp, jar_name)
            shutil.copy2(jar, dest)
            gh("release", "upload", tag, "-R", GH_REPO, "--clobber", dest)
        print(f"Client {cv} veröffentlicht (Release {tag}).")
    elif not args.site_only:
        setup = os.path.join(BUNDLE, "nsis", f"Chaos Launcher_{version}_x64-setup.exe")
        msi = os.path.join(BUNDLE, "msi", f"Chaos Launcher_{version}_x64_en-US.msi")
        jar = os.path.join(ROOT, "src-tauri", "resources", "chaos-client.jar")
        if not os.path.exists(setup):
            sys.exit(f"Setup fehlt: {setup} – erst `npm run tauri build`")
        setup_name = f"ChaosLauncher-{version}-setup.exe"
        msi_name = f"ChaosLauncher-{version}.msi"
        launcher = {
            "version": version, "fileName": setup_name, "url": dl_url(setup_name),
            "sha256": sha256(setup), "size": os.path.getsize(setup), "publishedAt": today,
            "notes": args.notes or feed["channels"]["stable"].get("launcher", {}).get("notes", ""),
        }
        assets.append((setup, setup_name))
        if os.path.exists(msi):
            launcher["msiUrl"] = dl_url(msi_name)
            launcher["msiSha256"] = sha256(msi)
            assets.append((msi, msi_name))
        feed["channels"]["stable"]["launcher"] = launcher
        if os.path.exists(jar):
            cv = jar_version(jar)
            jar_name = f"chaos-client-{cv}.jar"
            feed["channels"]["stable"]["client"] = {
                "version": cv, "fileName": jar_name, "url": dl_url(jar_name),
                "sha256": sha256(jar), "size": os.path.getsize(jar), "publishedAt": today,
                "notes": args.client_notes or feed["channels"]["stable"].get("client", {}).get("notes", ""),
            }
            assets.append((jar, jar_name))
        hist = [h for h in feed.get("history", []) if h.get("version") != version]
        hist.insert(0, {"version": version, "date": today, "notes": args.notes or next((h.get("notes", "") for h in feed.get("history", []) if h.get("version") == version), "")})
        feed["history"] = hist[:20]
        feed["updatedAt"] = today
        feed["downloads"] = "github" if use_github else "server"
        json.dump(feed, open(feed_path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
        with open(os.path.join(SITE, "SHA256SUMS"), "w", encoding="utf-8") as f:
            for local, name in assets:
                f.write(f"{sha256(local)}  {name}\n")
        print(f"releases.json aktualisiert: Launcher {version}" + (f", Client {feed['channels']['stable']['client']['version']}" if 'client' in feed['channels']['stable'] else ""))

        if use_github:
            # Assets mit Zielnamen in Temp-Ordner (gh lädt unter dem Dateinamen hoch)
            tmp = staging_dir("release")
            if True:
                paths = []
                for local, name in assets:
                    dest = os.path.join(tmp, name)
                    shutil.copy2(local, dest)
                    paths.append(dest)
                shutil.copy2(os.path.join(SITE, "SHA256SUMS"), os.path.join(tmp, "SHA256SUMS"))
                paths.append(os.path.join(tmp, "SHA256SUMS"))
                notes = (args.notes or launcher["notes"] or "").strip()
                body = (notes + "\n\n" if notes else "") + f"**Download:** `{setup_name}` (Installer) · `{msi_name}` (MSI) · Chaos Client `{feed['channels']['stable'].get('client', {}).get('fileName', '')}`\n\nSHA-256 in `SHA256SUMS`. Website: {PAGES_URL}"
                notes_path = os.path.join(tmp, "RELEASE_NOTES.md")
                with open(notes_path, "w", encoding="utf-8", newline="\n") as f:
                    f.write(body)
                exists = gh("release", "view", tag, "-R", GH_REPO, check=False, capture=True).returncode == 0
                if exists:
                    gh("release", "edit", tag, "-R", GH_REPO, "--title", f"Chaos Launcher {version}", "--notes-file", notes_path)
                    gh("release", "upload", tag, "-R", GH_REPO, "--clobber", *paths)
                else:
                    gh("release", "create", tag, "-R", GH_REPO, "--title", f"Chaos Launcher {version}", "--notes-file", notes_path, "--latest", *paths)
                print(f"GitHub-Release: https://github.com/{GH_REPO}/releases/tag/{tag}")

    site = collect_site()
    # Cloudflare (Worker mit statischen Assets) – primäre Website-Adresse, sofort online
    if not args.no_cloudflare:
        r = run(["npx", "-y", "wrangler@latest", "deploy"], check=False, cwd=os.path.join(ROOT, "website-deploy"), shell=(os.name == "nt"))
        print("Cloudflare: " + ("https://chaos-launcher.chaoscraft.workers.dev" if r.returncode == 0 else "Deploy fehlgeschlagen (npx wrangler login?)"))
    if use_github:
        publish_pages(site)

    if args.server:
        uploads = list(site) + [(local, f"download/{name}") for local, name in assets]
        print(f"Lade {len(uploads)} Dateien nach {SSH_HOST}:{REMOTE_ROOT} …")
        staging = ssh("mktemp -d").stdout.strip()
        with tempfile.TemporaryDirectory() as tmp:
            for local, rel in uploads:
                dest = os.path.join(tmp, rel)
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                shutil.copy2(local, dest)
            subprocess.run(["scp", "-q", "-o", "BatchMode=yes", "-r", tmp + "/.", f"{SSH_HOST}:{staging}/"], check=True)
        ssh(f"sudo mkdir -p {REMOTE_ROOT}/download {REMOTE_ROOT}/assets && sudo cp -r {staging}/. {REMOTE_ROOT}/ && sudo chown -R nginx:nginx {REMOTE_ROOT} && sudo chmod -R a+rX {REMOTE_ROOT} && (command -v restorecon >/dev/null && sudo restorecon -R {REMOTE_ROOT} || true) && rm -rf {staging}")
        r = subprocess.run(["curl", "-s", "-m", "8", f"{PUBLIC}/releases.json"], capture_output=True, text=True)
        print("Server: veröffentlicht." if r.returncode == 0 and '"channels"' in r.stdout else "Server: hochgeladen – von außen (noch) nicht erreichbar.")


if __name__ == "__main__":
    main()
