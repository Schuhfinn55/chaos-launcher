#!/usr/bin/env bash
# Synchronisiert die frisch gebaute Onyx-Visuals-JAR in den Launcher-Resource-Ordner.
# Aufruf:  bash sync-client.sh        (aus dem onyx-launcher Ordner)
set -e
SRC="/d/ZCodeProject/onyx-visuals/build/libs/onyx-visuals-1.0.0.jar"
DST="$(dirname "$0")/src-tauri/resources/onyx-visuals.jar"

if [ ! -f "$SRC" ]; then
    echo "FEHLER: Visuals-JAR nicht gefunden: $SRC"
    echo "Erst bauen:  cd /d/ZCodeProject/onyx-visuals && ./gradlew build"
    exit 1
fi

mkdir -p "$(dirname "$DST")"
cp "$SRC" "$DST"
echo "OK: $(basename "$SRC") -> $DST ($(stat -c%s "$DST") bytes)"
