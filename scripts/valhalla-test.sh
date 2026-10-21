#!/usr/bin/env bash
# Builds Valhalla tiles from a synthetic street grid and serves them on :8002 — a real routing
# engine for integration tests and offline development, no OSM download needed.
#   scripts/valhalla-test.sh            # build + serve (foreground)
#   scripts/valhalla-test.sh --daemon   # build + serve in background
# Then: VALHALLA_URL=http://127.0.0.1:8002 npm run test:integration
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${VALHALLA_TEST_DIR:-$ROOT/.valhalla-test}"
VENV="$WORK/venv"
mkdir -p "$WORK/tiles"
export PATH="$VENV/bin:$PATH"   # pyvalhalla resolves its executables through PATH
export PATH="$VENV/bin:$PATH"   # pyvalhalla resolves its executables through PATH

if [ ! -x "$VENV/bin/python" ]; then
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q "pyvalhalla==3.9.1" "osmium==4.3.2"
fi

"$VENV/bin/python" "$ROOT/apps/api/test/fixtures/valhalla/make_grid.py" "$WORK/grid.osm.pbf"
"$VENV/bin/python" - "$WORK" <<'EOF'
import json, sys
from valhalla import get_config
work = sys.argv[1]
c = get_config(tile_extract='', tile_dir=f'{work}/tiles')
c['mjolnir']['admin'] = ''
c['mjolnir']['timezone'] = ''
c['httpd']['service']['listen'] = 'tcp://127.0.0.1:8002'
json.dump(c, open(f'{work}/valhalla.json', 'w'), indent=1)
EOF
(cd "$WORK" && "$VENV/bin/python" -m valhalla valhalla_build_tiles -c valhalla.json grid.osm.pbf >build.log 2>&1)
echo "tiles built in $WORK/tiles"

if [ "${1:-}" = "--daemon" ]; then
  (cd "$WORK" && nohup "$VENV/bin/python" -m valhalla valhalla_service valhalla.json 2 >service.log 2>&1 &)
  for _ in $(seq 1 30); do curl -sf http://127.0.0.1:8002/status >/dev/null && { echo "valhalla up on :8002"; exit 0; }; sleep 1; done
  echo "valhalla did not start; see $WORK/service.log" >&2; exit 1
fi
cd "$WORK" && exec "$VENV/bin/python" -m valhalla valhalla_service valhalla.json 2
