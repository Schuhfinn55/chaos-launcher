#!/usr/bin/env python3
"""
Chaos Launcher – Website & Release veröffentlichen

    python website/publish.py                 # Website + aktuelle Builds hochladen
    python website/publish.py --site-only     # nur HTML/CSS/JS/News
    python website/publish.py --notes "Text"  # Release-Notes für diese Version

Liest Version aus package.json, nimmt die Builds aus src-tauri/target/release/bundle
und die Client-JAR aus src-tauri/resources, berechnet SHA-256, schreibt
website/releases.json (Feed für Launcher-Updates + Website) und lädt alles per
SSH (Host-Alias "mc") nach /var/www/chaoslauncher auf den Server.
"""
import argparse, hashlib, json, os, subprocess, sys, zipfile, datetime, shutil, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, "website")
BUNDLE = os.path.join(ROOT, "src-tauri", "target", "release", "bundle")
SSH_HOST = os.environ.get("CHAOS_SSH_HOST", "mc")
REMOTE_ROOT = "/var/www/chaoslauncher"
PUBLIC = "https://chaoslauncher.duckdns.org"

def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

def jar_version(jar):
    with zipfile.ZipFile(jar) as z:
        return json.loads(z.read("fabric.mod.json"))["version"]

def ssh(cmd, check=True):
    return subprocess.run(["ssh", "-o", "BatchMode=yes", SSH_HOST, cmd], check=check, capture_output=True, text=True)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--site-only", action="store_true")
    ap.add_argument("--notes", default="")
    ap.add_argument("--client-notes", default="")
    args = ap.parse_args()

    pkg = json.load(open(os.path.join(ROOT, "package.json"), encoding="utf-8"))
    version = pkg["version"]
    today = datetime.date.today().isoformat()
    feed_path = os.path.join(SITE, "releases.json")
    feed = json.load(open(feed_path, encoding="utf-8")) if os.path.exists(feed_path) else {"channels": {"stable": {}}, "history": []}

    uploads = []  # (lokal, remote-relativ)
    if not args.site_only:
        setup = os.path.join(BUNDLE, "nsis", f"Chaos Launcher_{version}_x64-setup.exe")
        msi = os.path.join(BUNDLE, "msi", f"Chaos Launcher_{version}_x64_en-US.msi")
        jar = os.path.join(ROOT, "src-tauri", "resources", "chaos-client.jar")
        if not os.path.exists(setup):
            sys.exit(f"Setup fehlt: {setup} – erst `npm run tauri build`")
        setup_name = f"ChaosLauncher-{version}-setup.exe"
        msi_name = f"ChaosLauncher-{version}.msi"
        launcher = {
            "version": version, "fileName": setup_name, "url": f"{PUBLIC}/download/{setup_name}",
            "sha256": sha256(setup), "size": os.path.getsize(setup), "publishedAt": today,
            "notes": args.notes or feed["channels"]["stable"].get("launcher", {}).get("notes", ""),
        }
        uploads.append((setup, f"download/{setup_name}"))
        if os.path.exists(msi):
            launcher["msiUrl"] = f"{PUBLIC}/download/{msi_name}"
            launcher["msiSha256"] = sha256(msi)
            uploads.append((msi, f"download/{msi_name}"))
        feed["channels"]["stable"]["launcher"] = launcher
        if os.path.exists(jar):
            cv = jar_version(jar)
            jar_name = f"chaos-client-{cv}.jar"
            feed["channels"]["stable"]["client"] = {
                "version": cv, "fileName": jar_name, "url": f"{PUBLIC}/download/{jar_name}",
                "sha256": sha256(jar), "size": os.path.getsize(jar), "publishedAt": today,
                "notes": args.client_notes or feed["channels"]["stable"].get("client", {}).get("notes", ""),
            }
            uploads.append((jar, f"download/{jar_name}"))
        hist = [h for h in feed.get("history", []) if h.get("version") != version]
        hist.insert(0, {"version": version, "date": today, "notes": args.notes or next((h.get("notes", "") for h in feed.get("history", []) if h.get("version") == version), "")})
        feed["history"] = hist[:20]
        feed["updatedAt"] = today
        json.dump(feed, open(feed_path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
        # SHA256SUMS für manuelle Prüfung
        with open(os.path.join(SITE, "SHA256SUMS"), "w", encoding="utf-8") as f:
            for local, rel in uploads:
                f.write(f"{sha256(local)}  {os.path.basename(rel)}\n")
        print(f"releases.json aktualisiert: Launcher {version}" + (f", Client {feed['channels']['stable']['client']['version']}" if 'client' in feed['channels']['stable'] else ""))

    # Website-Dateien
    for name in ["index.html", "style.css", "app.js", "licenses.html", "releases.json", "news.json", "SHA256SUMS"]:
        p = os.path.join(SITE, name)
        if os.path.exists(p):
            uploads.append((p, name))
    for name in os.listdir(os.path.join(SITE, "assets")):
        uploads.append((os.path.join(SITE, "assets", name), f"assets/{name}"))

    # Upload: erst in ein Temp-Verzeichnis, dann mit sudo in den Webroot
    print(f"Lade {len(uploads)} Dateien nach {SSH_HOST}:{REMOTE_ROOT} …")
    staging = ssh("mktemp -d").stdout.strip()
    with tempfile.TemporaryDirectory() as tmp:
        for local, rel in uploads:
            dest = os.path.join(tmp, rel)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            shutil.copy2(local, dest)
        subprocess.run(["scp", "-q", "-o", "BatchMode=yes", "-r", tmp + "/.", f"{SSH_HOST}:{staging}/"], check=True)
    ssh(f"sudo mkdir -p {REMOTE_ROOT}/download {REMOTE_ROOT}/assets && sudo cp -r {staging}/. {REMOTE_ROOT}/ && sudo chown -R nginx:nginx {REMOTE_ROOT} && sudo chmod -R a+rX {REMOTE_ROOT} && rm -rf {staging}")
    r = subprocess.run(["curl", "-s", "-m", "8", f"{PUBLIC}/releases.json"], capture_output=True, text=True)
    print("Veröffentlicht." if r.returncode == 0 and '"channels"' in r.stdout else "Hochgeladen – von außen (noch) nicht erreichbar; prüfe Zertifikat/Ports.")

if __name__ == "__main__":
    main()
