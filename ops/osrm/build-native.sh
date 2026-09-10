#!/usr/bin/env bash
set -euo pipefail
# Build on Linux only; no application secrets or production data are used.
OUT="${1:-routing-bundle}"
mkdir -p "$OUT/bin" "$OUT/data" "$OUT/profiles"
curl -fL --retry 3 https://github.com/Project-OSRM/osrm-backend/releases/download/v26.9.0/node_osrm-v26.9.0-8-linux-x64-Release.tar.gz -o "$OUT/binaries.tar.gz"
echo "e78c1eda78c0f394f461edfb6f5342aff7cad4ab012d066073e65f1b5f50a6d8  $OUT/binaries.tar.gz" | sha256sum -c -
tar xzf "$OUT/binaries.tar.gz" --strip-components=1 -C "$OUT/bin"
curl -fL --retry 3 https://github.com/Project-OSRM/osrm-backend/archive/refs/tags/v26.9.0.tar.gz -o "$OUT/source.tar.gz"
tar xzf "$OUT/source.tar.gz" --strip-components=2 -C "$OUT/profiles" osrm-backend-26.9.0/profiles
curl -fL --retry 3 https://download.geofabrik.de/asia/israel-and-palestine-latest.osm.pbf -o "$OUT/source.osm.pbf"
osmium extract --bbox=34.98,31.30,35.16,31.48 --strategy=complete_ways "$OUT/source.osm.pbf" -o "$OUT/data/samou.osm.pbf"
"$OUT/bin/osrm-extract" --threads 1 -p "$OUT/profiles/car.lua" "$OUT/data/samou.osm.pbf"
"$OUT/bin/osrm-partition" --threads 1 "$OUT/data/samou.osrm"
"$OUT/bin/osrm-customize" --threads 1 "$OUT/data/samou.osrm"
sha256sum "$OUT/source.osm.pbf" > "$OUT/map-source-sha256.txt"
printf 'OSRM 26.9.0\nOSM data: Geofabrik Israel and Palestine\nBBox:34.98,31.30,35.16,31.48\nData copyright OpenStreetMap contributors, ODbL\n' > "$OUT/NOTICE.txt"
rm "$OUT/binaries.tar.gz" "$OUT/source.tar.gz" "$OUT/source.osm.pbf" "$OUT/data/samou.osm.pbf"
"$OUT/bin/osrm-routed" --algorithm mld --ip 127.0.0.1 --port 5000 --threads 1 "$OUT/data/samou.osrm" > "$OUT/smoke.log" 2>&1 &
ROUTE_PID=$!
trap 'kill "$ROUTE_PID" 2>/dev/null || true' EXIT
for i in $(seq 1 30); do
 if curl -fsS 'http://127.0.0.1:5000/nearest/v1/driving/35.0661,31.3967' > /dev/null; then break; fi
 sleep 1
done
node ops/osrm/smoke.mjs
ps -o pid,rss,vsz,args -p "$ROUTE_PID"
du -sh "$OUT"
