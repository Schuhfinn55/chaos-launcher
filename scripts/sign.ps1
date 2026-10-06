# Chaos Launcher – Code-Signierung (wird von `npm run tauri build` für jede EXE/MSI aufgerufen).
# Ohne Zertifikat passiert nichts (Exit 0), der Build läuft normal durch.
#
# Zertifikat aktivieren – eine der Varianten:
#   1) Zertifikat im Windows-Zertifikatspeicher (z. B. Certum/Sectigo/SSL.com, Token oder PFX importiert):
#        setx CHAOS_SIGN_THUMBPRINT <Thumbprint>
#   2) PFX-Datei:
#        setx CHAOS_SIGN_PFX  D:\keys\chaos.pfx
#        setx CHAOS_SIGN_PFX_PASSWORD <Passwort>      (oder leer lassen -> Abfrage)
#   3) Azure Trusted Signing / SignPath: CHAOS_SIGN_COMMAND = eigener Befehl mit {file} als Platzhalter
# Danach: neue Konsole öffnen und bauen.
param([Parameter(Mandatory = $true)][string]$File)

$ErrorActionPreference = "Stop"
$ts = if ($env:CHAOS_SIGN_TIMESTAMP) { $env:CHAOS_SIGN_TIMESTAMP } else { "http://timestamp.digicert.com" }

function Find-Signtool {
    $c = Get-Command signtool.exe -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    $kits = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending
    if ($kits) { return $kits[0].FullName }
    throw "signtool.exe nicht gefunden (Windows SDK installieren)."
}

if ($env:CHAOS_SIGN_COMMAND) {
    $cmd = $env:CHAOS_SIGN_COMMAND.Replace("{file}", "`"$File`"")
    Write-Host "[sign] $cmd"
    cmd /c $cmd
    if ($LASTEXITCODE -ne 0) { throw "Signierbefehl fehlgeschlagen ($LASTEXITCODE)" }
    exit 0
}

if ($env:CHAOS_SIGN_THUMBPRINT) {
    $st = Find-Signtool
    Write-Host "[sign] signtool (Thumbprint) -> $File"
    & $st sign /fd sha256 /td sha256 /tr $ts /sha1 $env:CHAOS_SIGN_THUMBPRINT /d "Chaos Launcher" /du "https://chaos-launcher.chaoscraft.workers.dev" "$File"
    if ($LASTEXITCODE -ne 0) { throw "signtool fehlgeschlagen ($LASTEXITCODE)" }
    exit 0
}

if ($env:CHAOS_SIGN_PFX) {
    $st = Find-Signtool
    Write-Host "[sign] signtool (PFX) -> $File"
    $args = @("sign", "/fd", "sha256", "/td", "sha256", "/tr", $ts, "/f", $env:CHAOS_SIGN_PFX, "/d", "Chaos Launcher", "/du", "https://chaos-launcher.chaoscraft.workers.dev")
    if ($env:CHAOS_SIGN_PFX_PASSWORD) { $args += @("/p", $env:CHAOS_SIGN_PFX_PASSWORD) }
    $args += "$File"
    & $st @args
    if ($LASTEXITCODE -ne 0) { throw "signtool fehlgeschlagen ($LASTEXITCODE)" }
    exit 0
}

Write-Host "[sign] Kein Zertifikat konfiguriert – $([System.IO.Path]::GetFileName($File)) bleibt unsigniert."
exit 0
