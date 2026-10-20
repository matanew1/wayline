# Wayline — backend (Phase 0)

Community-powered navigation: routes with live ETAs, turn-by-turn guidance and crowd reports
(police, crashes, hazards, closures). This repo is the **API + realtime gateway + infra** that the
mobile app talks to. The product scope, screens and architecture decisions are on the design canvas
("Engineering handoff" artboard).

```
apps/api              NestJS 11 API (REST + Socket.IO), TypeScript
packages/contracts    Types + typed fetch client generated from openapi.yaml (for the React Native app)
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

## Deploy

- Image: `docker build -f apps/api/Dockerfile .` (non-root, healthcheck, migrations baked in at `/app/sql`)
- Kubernetes: `infra/k8s/base` (Deployment ×2, HPA 2–20, PDB, Ingress with long websocket timeouts,
  migration Job). `infra/k8s/minikube` adds single-instance Postgres/Redis/Redpanda for local clusters.
- CI (`.github/workflows/ci.yml`): typecheck → unit/e2e → integration on PostGIS + Redis service
  containers → build → OpenAPI drift check → image build (pushed to GHCR on `main`).

## Not built yet (next phases)

- **SMS provider** — `LogSmsSender` only logs the code. Implement `SmsSender` for Twilio/Vonage/SNS.
- **Traffic pipeline (Phase 3)** — consumer of `probes.raw` → Valhalla Meili map-matching → edge
  speeds → `traffic.edges` → Valhalla live traffic; then the `traffic.delta` realtime event.
- **Trust score updates** — the column exists and seeds report confidence; nothing raises/lowers it yet.
- **Shared rate limiting** — Throttler is per replica; add a Redis store or limit at the ingress.
- **Observability** — OpenTelemetry tracing + metrics exporters.
- Self-hosted Photon/Pelias (the public Photon instance is for development only).
