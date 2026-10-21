# Wayline

Community-powered navigation: routes with live ETAs, turn-by-turn guidance and crowd reports
(police, crashes, hazards, closures). The product scope, screens and architecture decisions are on
the design canvas ("Engineering handoff" artboard).

- **Phase 0 — backend:** API, realtime gateway, infra
- **Phase 1 — Drive A→B:** the mobile app + platform-free navigation engine ([Mobile app](#mobile-app))
- **Phase 2 — community:** reports, votes, realtime fan-out, trust scores, shared rate limits
- **Phase 3 — live traffic:** probe pipeline, live-traffic routing, speed limits, faster-route offers ([Live traffic](#live-traffic))

```
apps/api                  NestJS 11 API (REST + Socket.IO), TypeScript
apps/traffic-worker       Python 3.13 service: GPS probes → map matching → live per-edge speeds
apps/mobile               Expo SDK 58 / React Native 0.88 driver app (MapLibre, background GPS, voice, Hebrew/RTL)
packages/navigation-core  Guidance engine: route tracking, voice timing, rerouting, report alerts, probe upload, simulator
packages/contracts        Types + typed fetch client generated from openapi.yaml
scripts/sim-drive.ts      Headless end-to-end drive against a running API
scripts/valhalla-test.sh  Real Valhalla on a synthetic street grid (tests / offline dev)
infra/sql                 Forward-only SQL migrations (PostGIS)
infra/k8s                 Kustomize base (API, worker, Valhalla, Photon) + Minikube overlay
openapi.yaml              Generated API contract — CI fails if it drifts from the code
docker-compose.yml        Postgres/PostGIS, Redis, Redpanda, Valhalla, Photon, Jaeger, Prometheus, API, worker
```

## Run it

**Zero dependencies (in-memory everything, mock routing):**

```bash
npm install
npm run dev                  # http://localhost:3000/docs
```

**With real infrastructure:**

```bash
npm run infra:up                                   # postgres, redis, redpanda
npm run build && DATABASE_URL=postgres://wayline:wayline@localhost:5432/wayline npm run migrate
STORE_DRIVER=infra npm run dev

docker compose --profile routing up -d valhalla    # first start downloads OSM + builds tiles
STORE_DRIVER=infra ROUTING_DRIVER=valhalla GEOCODER_DRIVER=photon npm run dev
```

Every external dependency is behind a port with an in-memory adapter, picked by env:

| Env | Values | Adapters |
|---|---|---|
| `STORE_DRIVER` | `memory` \| `infra` | users, places, trips → Postgres · OTP, rate limits, route cache, active reports → Redis · probes → Kafka |
| `ROUTING_DRIVER` | `mock` \| `valhalla` | `MockRoutingEngine` (two L-shaped routes) / `ValhallaEngine` |
| `GEOCODER_DRIVER` | `memory` \| `photon` \| `pelias` | 5 sample places / Photon / Pelias |
| `SMS_DRIVER` | `log` \| `twilio` | codes in the log / Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM`) |

Production (`NODE_ENV=production`) refuses to boot with memory drivers, the log SMS sender, default
secrets or OTP echo on.

**Observability:** `GET /metrics` (Prometheus: HTTP latency per route template, routes planned,
reports, votes, probe fixes, realtime connections, live-vs-default edge pricing) · OpenTelemetry
traces when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (http, express, pg, ioredis, kafkajs auto-instrumented)
· JSON logs in production. `docker compose --profile observability up -d` runs Jaeger (:16686) and Prometheus (:9090).

## Test

```bash
npm test                        # API unit + e2e, navigation-core, mobile pure logic (in-memory, ~15 s)

scripts/valhalla-test.sh --daemon   # real Valhalla from a synthetic grid (pyvalhalla; no OSM download)
VALHALLA_URL=http://127.0.0.1:8002 npm run test:integration
                                # real Postgres+PostGIS, Redis and Valhalla: two API replicas over the Redis adapter,
                                # shared rate limits, Valhalla routes/instructions/toll avoidance/edges
                                # needs DATABASE_URL (a throwaway DB — it is wiped) and REDIS_URL (db 15 is flushed)

cd apps/traffic-worker && pip install -e '.[dev]' && pytest   # worker; integration needs VALHALLA_URL + REDIS_URL
```

**Device tests** (Maestro, `apps/mobile/.maestro`): guest start, search + simulated drive, report,
Hebrew/RTL, phone sign-in, account deletion. Run against a development build with the API on memory
drivers and `REVIEW_PHONE=+972500000001 REVIEW_CODE=246810`: `cd apps/mobile && maestro test .maestro`.
CI runs them on an Android emulator (`.github/workflows/e2e-android.yml`: PRs touching the app, nightly).

## API (v1)

Full contract: `/docs` (Swagger UI) or `openapi.yaml`.

| | |
|---|---|
| `POST /v1/auth/otp` · `/verify` · `/guest` · `/refresh` | Phone OTP sign-in (6 digits, 5 min, 5 attempts, 30 s resend cooldown), guest mode, JWT access (15 min) + refresh (30 d) |
| `GET /v1/places/search` | Autocomplete, biased to a point |
| `GET/PUT /v1/me/places`, `DELETE /v1/me/places/:id` | Home, Work (one each) and up to 50 favourites |
| `GET /v1/me`, `DELETE /v1/me` | Account; deletion removes saved places and trips, keeps reports on the map unlinked, revokes tokens (probes are never linked to users) |
| `GET /privacy`, `GET /delete-account` | Privacy policy and account-deletion pages (en/he) for the store listings |
| `GET /map/style.json` | Basemap style for our tiles (`MAP_TILES_URL`), or a redirect to OpenFreeMap |
| `POST /v1/routes` | Up to 3 alternatives ranked by live-traffic ETA: polyline6, maneuvers, flags, speed limits, congestion, realtime cells; honours `avoid` tolls/highways/ferries |
| `POST /v1/trips`, `PATCH /v1/trips/:id` | Start (returns a probe token), reroute, finish/cancel (revokes the token) |
| `POST /v1/trips/:id/eta` | Live remaining time + a faster route when it saves ≥ 3 min (position used once, not stored) |
| `POST /v1/probes` | Batched GPS fixes → Kafka `probes.raw`. Auth is the probe token only; the message carries a random session id, never the user |
| `POST /v1/reports`, `POST /v1/reports/:id/votes`, `GET /v1/reports/nearby` | Create (idempotent on `clientId`, 10/hour/user, merges duplicates within 150 m and 45° heading), vote, initial load |

**Realtime** — Socket.IO namespace `/rt`, websocket transport:

```ts
const s = io(`${API}/rt`, { auth: { token: accessToken }, transports: ['websocket'] });
await s.emitWithAck('subscribe', { cells: route.cells });   // replaces previous subscription
s.on('report.upsert', (r) => …);  s.on('report.remove', ({ id }) => …);
```

**Report rules** (`apps/api/src/modules/reports/report.rules.ts`): TTL by type (traffic 30 min, police 45,
crash 60, hazard 90, closure 24 h, camera 30 d); "still there" adds +½ TTL (capped at 3× TTL) and
+0.1 confidence; two consecutive "not there" expire it; one vote per user. The reporter's trust
(which seeds the confidence of their future reports) gains 0.02 per confirmation and loses 0.05 when
a report is voted away; guests are capped at 0.5. Active reports live in
Redis (GEO index + per-report key that expires itself); every change is also written to Postgres
in one transaction, in order per report, off the request path.

**Typed client for the app:**

```ts
import { createWaylineClient } from '@wayline/contracts';
const api = createWaylineClient(API, () => tokens.access);
const { data: routes } = await api.POST('/v1/routes', { body: { origin, destination } });
```

## Live traffic

```
app ──probes (10 s batches, trimmed 300 m at both ends)──▶ API ──▶ Kafka probes.raw
                                                                       │
                     apps/traffic-worker ◀─────────────────────────────┘
                     stitch batches per trip → Valhalla trace_attributes (map_snap)
                     → speed per directed edge → 5-min window, published only after ≥ 2 trips
                     → Redis traffic:live · Kafka traffic.edges · Postgres edge_speeds_hourly
                                                                       │
API POST /routes ──Valhalla route──▶ edges via trace_attributes (edge_walk) ◀── HMGET traffic:live
     → ETA = router estimate × live/free-flow time over the same edges → re-rank, speed limits, congestion
App every 60 s ──POST /trips/:id/eta──▶ corrected ETA + "Faster route found" offer
```

Live data is keyed by Valhalla's directional edge id, which both sides get from the same tiles
(the worker integration test asserts the ids match). Speeds older than 15 min are ignored.
Upgrade path when needed: write speeds into Valhalla's `traffic.tar` so the router itself costs
edges with live speeds, instead of re-ranking its alternatives.

## Mobile app

Expo with Continuous Native Generation: `android/` and `ios/` are generated from `app.config.ts`
(never committed). MapLibre and background location need native code, so use a **development
build**, not Expo Go.

```bash
npm install
npm run dev                                  # API on :3000 (in-memory), in another terminal:
cd apps/mobile
npx expo run:android                         # or run:ios — builds the dev client once, then fast refresh
# physical phone: EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:3000 npx expo start
```

Without driving anywhere: open a route preview, switch on **Simulate drive (dev)** and tap Go —
the simulator feeds the same `NavigationSession` the GPS does. `npm run sim:drive` does the whole
flow headless (auth → search → route → trip → guidance → police alert → vote → probes → arrival).

**How a drive works** (`src/nav/drive.ts`):

1. `POST /routes` → preview with up to 3 alternatives → `POST /trips` returns a probe token
2. `NavigationSession` (from `@wayline/navigation-core`) gets 1 Hz fixes from background location
   (Android foreground service / iOS `location` background mode) or the simulator
3. Per fix it snaps to the route, updates maneuver/ETA, speaks guidance at ~400 m / ~10 s / at the turn
   (2 km / 1 km at highway speed), raises alerts for reports ahead within a speed-scaled window,
   and batches probes (first/last 300 m trimmed on the device, backoff on 503, stop on 401)
4. Off-route for 3 consecutive fixes → reroute (≥ 10 s apart) → `PATCH /trips/:id` with the new route,
   realtime subscription moves to the new route's cells
5. Every 60 s `POST /trips/:id/eta`: the server's live-traffic remaining time corrects the local ETA;
   a faster route shows as a card (and is spoken) — taking it is a normal reroute
6. Arrival → `PATCH /trips/:id {status: finished}`

**Settings** (persisted): language (phone / Hebrew / English — Hebrew flips the layout to RTL with a
one-time reload, and routes, voice and search results switch too), voice, avoid tolls / highways,
which report types are spoken. **Account:** phone sign-in with SMS code; guests can use everything.

| Builds (`eas.json`) | `APP_VARIANT` | Notes |
|---|---|---|
| `development` | development | dev client, `com.wayline.app.dev`, cleartext HTTP allowed for a local API |
| `preview` | preview | internal distribution, staging API |
| `production` | production | store build; set `EXPO_PUBLIC_API_URL` |
| `production-car` | production | same, with CarPlay / Android Auto (`WAYLINE_CAR=1`) |

The map style comes from the API (`/map/style.json`): our own tiles when `MAP_TILES_URL` is set,
OpenFreeMap otherwise. `EXPO_PUBLIC_MAP_STYLE_URL` overrides it.

**CarPlay / Android Auto** (`src/car`) is opt-in at build time: `WAYLINE_CAR=1` links the vendored
`packages/react-native-carplay` and applies `plugins/withCar.js` (CarPlay scene + entitlement,
Android Auto `automotive_app_desc`). Normal builds don't link it. The car screen shows the map,
Home / Work drives, the next maneuver and the one after, ETA and remaining distance, rerouting, and
an End button — all from the same `NavigationSession` snapshot the phone uses (`carGuidance()` in
navigation-core).

**Store compliance:** in-app account deletion (Settings → Account), a prominent background-location
disclosure before the first real drive (Google Play policy), privacy policy and deletion pages served
by the API, and review sign-in (`REVIEW_PHONE` / `REVIEW_CODE`). Listing copy, data-safety /
privacy-label answers and review notes: `docs/store/`.

## Map data

`infra/map-data/build.sh` builds both datasets from the Geofabrik Israel extract: Valhalla routing
tiles (`valhalla_tiles.tar`) and a PMTiles basemap (Planetiler, OpenMapTiles schema, Hebrew / English /
Arabic names). Docker by default; `--local` uses pyvalhalla. `MAP_DATA_S3_URI` uploads the result.
Serving: Martin (`docker compose --profile tiles up -d`, `infra/k8s/base/tiles.yaml` with a monthly
rebuild CronJob); `.github/workflows/map-data.yml` builds on demand and on a schedule.

## Deploy

- Image: `docker build -f apps/api/Dockerfile .` (non-root, healthcheck, migrations baked in at `/app/sql`)
- Kubernetes: `infra/k8s/base` (Deployment ×2, HPA 2–20, PDB, Ingress with long websocket timeouts,
  migration Job). `infra/k8s/minikube` adds single-instance Postgres/Redis/Redpanda for local clusters.
- Worker image: `docker build apps/traffic-worker` (non-root, `/health`, `/metrics` on :9464)
- CI (`.github/workflows/ci.yml`): typecheck → unit/e2e → real Valhalla from the synthetic grid →
  integration on PostGIS + Redis + Valhalla → worker tests → build → OpenAPI drift check → mobile
  (core tests, typecheck, lint, both bundles) → API and worker images (pushed to GHCR on `main`).

## Before launch (needs accounts, devices or approvals — not code)

- **Run on real phones and cars.** Everything is verified by tests, typecheck, lint, Metro bundles,
  the Maestro flows on an Android emulator, and native compiles in CI (iOS simulator with and
  without CarPlay, Android with Android Auto — `.github/workflows/native-builds.yml`). Still to check
  by hand: guidance with the screen off, audio ducking, Android 14 foreground-service behaviour, iOS
  background location, and the car screens in the CarPlay Simulator / Android Auto Desktop Head Unit.
- **Twilio:** account, a Messaging Service, and an alphanumeric sender ID registered for Israel.
- **Apple / Google approvals:** CarPlay navigation entitlement (request from Apple for your team),
  Android Auto car-app review, background-location review (the video and justification are scripted
  in `docs/store/background-location.md`).
- **Fill the placeholders:** legal entity and contact in the privacy policy (`legal.content.ts`),
  store listing copy, production API / tile hosts in `eas.json`.
- **Run the map-data build** on a machine with Docker (or the workflow), then set `MAP_TILES_URL`.
