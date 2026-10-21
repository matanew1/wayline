#!/usr/bin/env bash
# Builds Wayline's map data from OpenStreetMap:
#   valhalla/   routing + map-matching tiles (Valhalla)    → mount at /custom_files for the valhalla service
#   israel.pmtiles  basemap vector tiles (Planetiler, OpenMapTiles schema) → served by Martin
#
# Usage:
#   infra/map-data/build.sh [--out DIR] [--area israel-and-palestine] [--pbf FILE] [--local] [--skip-basemap] [--skip-routing]
#
#   default   uses Docker images (ghcr.io/onthegomap/planetiler, ghcr.io/nilsnolde/docker-valhalla)
#   --local   uses pyvalhalla for routing tiles (no Docker); basemap then needs PLANETILER_JAR + Java 21
#   --pbf     build from a local .osm.pbf instead of downloading the Geofabrik extract
#
# Optional upload: set MAP_DATA_S3_URI (e.g. s3://wayline-map-data/2026-10) with the aws CLI configured.
set -euo pipefail

OUT="$(pwd)/map-data-out"
AREA="israel-and-palestine"
PBF=""
LOCAL=0
BASEMAP=1
ROUTING=1
PLANETILER_IMAGE="ghcr.io/onthegomap/planetiler:0.10.2"
VALHALLA_IMAGE="ghcr.io/nilsnolde/docker-valhalla/valhalla:latest"
GEOFABRIK="https://download.geofabrik.de"

while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    --area) AREA="$2"; shift 2 ;;
    --pbf) PBF="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"; shift 2 ;;
    --local) LOCAL=1; shift ;;
    --skip-basemap) BASEMAP=0; shift ;;
    --skip-routing) ROUTING=0; shift ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
log() { echo "[map-data] $*"; }

# ---- source extract --------------------------------------------------------------------------
if [ -z "$PBF" ]; then
  PBF="$OUT/$AREA-latest.osm.pbf"
  URL="$GEOFABRIK/asia/$AREA-latest.osm.pbf"
  log "downloading $URL"
  curl -fL --retry 3 -o "$PBF.tmp" "$URL"
  curl -fsL "$URL.md5" | awk '{print $1"  '"$PBF.tmp"'"}' | md5sum -c - >/dev/null
  mv "$PBF.tmp" "$PBF"
fi
log "source: $PBF ($(du -h "$PBF" | cut -f1))"

# ---- routing tiles (Valhalla) ------------------------------------------------------------------
if [ "$ROUTING" = 1 ]; then
  mkdir -p "$OUT/valhalla"
  if [ "$LOCAL" = 1 ]; then
    VENV="$OUT/.venv"
    [ -x "$VENV/bin/python" ] || { python3 -m venv "$VENV"; "$VENV/bin/pip" install -q "pyvalhalla==3.9.1"; }
    export PATH="$VENV/bin:$PATH"
    mkdir -p "$OUT/valhalla/valhalla_tiles"
    "$VENV/bin/python" - "$OUT/valhalla" <<'EOF'
import json, sys
from valhalla import get_config
d = sys.argv[1]
c = get_config(tile_extract='', tile_dir=f'{d}/valhalla_tiles')
c['mjolnir']['tile_extract'] = f'{d}/valhalla_tiles.tar'
c['mjolnir']['admin'] = ''
c['mjolnir']['timezone'] = ''
json.dump(c, open(f'{d}/valhalla.json', 'w'), indent=1)
EOF
    log "building Valhalla tiles (pyvalhalla)"
    (cd "$OUT/valhalla" && python -m valhalla valhalla_build_tiles -c valhalla.json "$PBF" >build.log 2>&1)
    # valhalla_build_extract ships as a Python module in pyvalhalla, not as a binary
    (cd "$OUT/valhalla" && python -m valhalla.valhalla_build_extract -c valhalla.json -v >>build.log 2>&1)
  else
    cp "$PBF" "$OUT/valhalla/"
    log "building Valhalla tiles ($VALHALLA_IMAGE)"
    docker run --rm -v "$OUT/valhalla:/custom_files" \
      -e serve_tiles=False -e build_tar=True -e use_tiles_ignore_pbf=False -e force_rebuild=True \
      -e build_admins=True -e build_time_zones=True -e build_elevation=False \
      "$VALHALLA_IMAGE"
    rm -f "$OUT/valhalla/$(basename "$PBF")"
  fi
  test -s "$OUT/valhalla/valhalla_tiles.tar" || { echo "valhalla_tiles.tar missing" >&2; exit 1; }
  log "routing tiles: $(du -h "$OUT/valhalla/valhalla_tiles.tar" | cut -f1)"
fi

# ---- basemap (Planetiler → PMTiles) ------------------------------------------------------------
if [ "$BASEMAP" = 1 ]; then
  # --languages adds name:he / name:en etc. used by the style's labels
  ARGS=(--osm-path="/data/$(basename "$PBF")" --download --output=/data/israel.pmtiles --force --languages=he,en,ar --maxzoom=14)
  if [ "$LOCAL" = 1 ]; then
    : "${PLANETILER_JAR:?--local basemap needs PLANETILER_JAR (Java 21+)}"
    (cd "$OUT" && java -Xmx2g -jar "$PLANETILER_JAR" "${ARGS[@]//\/data\//$OUT/}")
  else
    [ "$(dirname "$PBF")" = "$OUT" ] || cp "$PBF" "$OUT/"
    log "building basemap ($PLANETILER_IMAGE)"
    docker run --rm -e JAVA_TOOL_OPTIONS="-Xmx2g" -v "$OUT:/data" "$PLANETILER_IMAGE" "${ARGS[@]}"
  fi
  test -s "$OUT/israel.pmtiles" || { echo "israel.pmtiles missing" >&2; exit 1; }
  log "basemap: $(du -h "$OUT/israel.pmtiles" | cut -f1)"
fi

# ---- manifest + optional upload ------------------------------------------------------------------
{
  echo "{"
  echo "  \"builtAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  echo "  \"source\": \"$(basename "$PBF")\","
  echo "  \"sourceSha256\": \"$(sha256sum "$PBF" | cut -d' ' -f1)\""
  echo "}"
} >"$OUT/manifest.json"
log "manifest: $OUT/manifest.json"

if [ -n "${MAP_DATA_S3_URI:-}" ]; then
  log "uploading to $MAP_DATA_S3_URI"
  [ "$ROUTING" = 1 ] && aws s3 cp "$OUT/valhalla/valhalla_tiles.tar" "$MAP_DATA_S3_URI/valhalla_tiles.tar"
  [ "$BASEMAP" = 1 ] && aws s3 cp "$OUT/israel.pmtiles" "$MAP_DATA_S3_URI/israel.pmtiles"
  aws s3 cp "$OUT/manifest.json" "$MAP_DATA_S3_URI/manifest.json"
fi
log "done"
