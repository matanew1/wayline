# Wayline

Community-powered navigation: routes with live ETAs, turn-by-turn guidance and crowd reports
(police, crashes, hazards, closures). The product scope, screens and architecture decisions are on
the design canvas ("Engineering handoff" artboard).

- **Phase 0 — backend:** API, realtime gateway, infra (below)
- **Phase 1 — Drive A→B:** the mobile app + platform-free navigation engine ([Mobile app](#mobile-app))

```
apps/api                  NestJS 11 API (REST + Socket.IO), TypeScript
apps/mobile               Expo SDK 58 / React Native 0.88 driver app (MapLibre, background GPS, voice)
packages/navigation-core  Guidance engine: route tracking, voice timing, rerouting, report alerts, probe upload, simulator
packages/contracts        Types + typed fetch client generated from openapi.yaml
scripts/sim-drive.ts      Headless end-to-end drive against a running API
infra/sql             Forward-only SQL migrations (PostGIS)
infra/k8s             Kustomize base + Minikube overlay
openapi.yaml          Generated API contract — CI fails if it drifts from the code
docker-compose.yml    Postgres/PostGIS, Redis, Redpanda (Kafka), Valhalla, the API
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

Production (`NODE_ENV=production`) refuses to boot with memory drivers, default secrets or OTP echo on.

## Test

```bash
npm test                     # unit + e2e on in-memory drivers (28 tests, ~6 s)
npm run test:integration     # real Postgres+PostGIS and Redis, incl. two API replicas over the Redis adapter
                             # needs DATABASE_URL (a throwaway DB — it is wiped) and REDIS_URL (db 15 is flushed)
```

## API (v1)

Full contract: `/docs` (Swagger UI) or `openapi.yaml`.

| | |
|---|---|
| `POST /v1/auth/otp` · `/verify` · `/guest` · `/refresh` | Phone OTP sign-in (6 digits, 5 min, 5 attempts, 30 s resend cooldown), guest mode, JWT access (15 min) + refresh (30 d) |
| `GET /v1/places/search` | Autocomplete, biased to a point |
| `GET/PUT /v1/me/places`, `DELETE /v1/me/places/:id` | Home, Work (one each) and up to 50 favourites |
| `POST /v1/routes` | Up to 3 alternatives: polyline6, maneuvers, flags, and the geohash cells to subscribe to |
| `POST /v1/trips`, `PATCH /v1/trips/:id` | Start (returns a probe token), reroute, finish/cancel (revokes the token) |
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
+0.1 confidence; two consecutive "not there" expire it; one vote per user. Active reports live in
Redis (GEO index + per-report key that expires itself); every change is also written to Postgres
in one transaction, in order per report, off the request path.

**Typed client for the app:**

```ts
import { createWaylineClient } from '@wayline/contracts';
const api = createWaylineClient(API, () => tokens.access);
const { data: routes } = await api.POST('/v1/routes', { body: { origin, destination } });
```

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
5. Arrival → `PATCH /trips/:id {status: finished}`

| Builds (`eas.json`) | `APP_VARIANT` | Notes |
|---|---|---|
| `development` | development | dev client, `com.wayline.app.dev`, cleartext HTTP allowed for a local API |
| `preview` | preview | internal distribution, staging API |
| `production` | production | store build; set `EXPO_PUBLIC_API_URL` |

Map tiles default to OpenFreeMap (free, no key) — set `EXPO_PUBLIC_MAP_STYLE_URL` to your own
PMTiles style for production.

## Deploy

- Image: `docker build -f apps/api/Dockerfile .` (non-root, healthcheck, migrations baked in at `/app/sql`)
- Kubernetes: `infra/k8s/base` (Deployment ×2, HPA 2–20, PDB, Ingress with long websocket timeouts,
  migration Job). `infra/k8s/minikube` adds single-instance Postgres/Redis/Redpanda for local clusters.
- CI (`.github/workflows/ci.yml`): typecheck → unit/e2e → integration on PostGIS + Redis service
  containers → build → OpenAPI drift check → image build (pushed to GHCR on `main`).

## Not built yet (next phases)

Mobile:
- **Not yet run on a device** — verified by typecheck, lint, Metro bundles for both platforms, native
  config generation, core tests and the headless drive. First real-device pass: map rendering,
  background guidance with the screen off, audio ducking, Android 14 foreground-service behaviour.
- **Phone sign-in screen** — `requestOtp` / `verifyOtp` exist in `src/api/auth.ts`; the app runs as a guest.
- **Speed limits** — the speed bubble shows current speed only (needs a speed-limit source, e.g. Valhalla `trace_attributes`).
- **Hebrew UI / RTL** — the guidance engine speaks Hebrew (`language: 'he'`); UI strings aren't localised yet.
- **Recents persistence**, settings screen, CarPlay / Android Auto (v1.1).

Backend:

- **SMS provider** — `LogSmsSender` only logs the code. Implement `SmsSender` for Twilio/Vonage/SNS.
- **Traffic pipeline (Phase 3)** — consumer of `probes.raw` → Valhalla Meili map-matching → edge
  speeds → `traffic.edges` → Valhalla live traffic; then the `traffic.delta` realtime event.
- **Trust score updates** — the column exists and seeds report confidence; nothing raises/lowers it yet.
- **Shared rate limiting** — Throttler is per replica; add a Redis store or limit at the ingress.
- **Observability** — OpenTelemetry tracing + metrics exporters.
- Self-hosted Photon/Pelias (the public Photon instance is for development only).
