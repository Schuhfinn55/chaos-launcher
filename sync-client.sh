#!/usr/bin/env bash
# Synchronisiert die frisch gebaute Chaos-Client-JAR in den Launcher-Resource-Ordner.
# Aufruf:  bash sync-client.sh        (aus dem onyx-launcher Ordner)
set -e
SRC=$(ls -t /d/ZCodeProject/onyx-visuals/build/libs/chaos-client-*.jar 2>/dev/null | grep -v sources | head -1)
DST="$(dirname "$0")/src-tauri/resources/chaos-client.jar"

if [ -z "$SRC" ] || [ ! -f "$SRC" ]; then
    echo "FEHLER: Chaos-Client-JAR nicht gefunden in onyx-visuals/build/libs"
    echo "Erst bauen:  cd /d/ZCodeProject/onyx-visuals && ./gradlew build"
    exit 1
fi

mkdir -p "$(dirname "$DST")"
cp "$SRC" "$DST"
echo "OK: $(basename "$SRC") -> $DST ($(stat -c%s "$DST") bytes)"
