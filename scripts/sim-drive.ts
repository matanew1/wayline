/**
 * Headless end-to-end drive against a running API — the same code path as the app,
 * minus the UI: guest auth → search → routes → trip → NavigationSession fed by the
 * simulator → probes uploaded → report alert raised from a live report → vote → arrival.
 *
 *   API_URL=http://localhost:3000 npx ts-node -T scripts/sim-drive.ts
 */
import { createWaylineClient, type Report } from '@wayline/contracts';
import { NavigationSession, RouteGeometry, RouteSimulator, type Fix } from '@wayline/navigation-core';

const API = process.env.API_URL ?? 'http://localhost:3000';

async function main() {
  let token: string | undefined;
  const api = createWaylineClient(API, () => token);
  const ok = <T>(r: { data?: T; error?: unknown; response: Response }, what: string): T => {
    if (r.data === undefined) throw new Error(`${what}: HTTP ${r.response.status} ${JSON.stringify(r.error)}`);
    return r.data;
  };

  token = ok(await api.POST('/v1/auth/guest'), 'guest').accessToken;
  const origin = { lat: 32.0853, lng: 34.7818 };
  const [dest] = ok(await api.GET('/v1/places/search', { params: { query: { q: 'park', ...origin } } }), 'search');
  const routes = ok(await api.POST('/v1/routes', { body: { origin, destination: { lat: dest.lat, lng: dest.lng } } }), 'routes');
  const route = routes[0];
  const trip = ok(await api.POST('/v1/trips', { body: { routeId: route.id } }), 'trip');

  // Another driver reports police 60% of the way along our route.
  const geo = new RouteGeometry(route.polyline6);
  const at = geo.pointAt(geo.lengthM * 0.6);
  const other = createWaylineClient(API, () => otherToken);
  let otherToken: string | undefined = ok(await api.POST('/v1/auth/guest'), 'guest2').accessToken;
  const police = ok(await other.POST('/v1/reports', { body: { type: 'police', ...at.point, heading: at.bearing, clientId: `sim-${Date.now()}` } }), 'report').report;
  otherToken = undefined;

  const nearby = ok(await api.GET('/v1/reports/nearby', { params: { query: { ...origin, radiusM: 20000 } } }), 'nearby');

  const said: string[] = [];
  let probesSent = 0;
  let etaChecks = 0;
  const limits = new Set<number | null>();
  let now = Date.now();
  const session = new NavigationSession<Report>(route, dest, {
    now: () => now,
    speak: (t) => said.push(t),
    alertText: (r) => (r.type === 'police' ? 'Police reported ahead' : null),
    requestReroute: async () => null,
    checkEta: async (at) => {
      etaChecks++;
      const r = ok(await api.POST('/v1/trips/{id}/eta', { params: { path: { id: trip.tripId } }, body: { lat: at.lat, lng: at.lng } }), 'eta');
      return { remainingS: r.remainingS, fasterRoute: r.fasterRoute, savingS: r.savingS };
    },
    sendProbes: async (fixes: Fix[]) => {
      const { response } = await api.POST('/v1/probes', { body: { probeToken: trip.probeToken, fixes: fixes.map((f) => ({ t: Math.round(f.t), lat: f.lat, lng: f.lng, speed: f.speed ?? undefined, heading: f.heading ?? undefined, acc: f.acc ?? undefined })) } });
      if (response.ok) { probesSent += fixes.length; return 'ok'; }
      return response.status === 401 ? 'drop' : 'retry';
    },
  });
  session.setReports(nearby);
  session.start();

  const sim = new RouteSimulator(route.polyline6, { speedMs: 14, noiseM: 4 });
  let alerted: string | null = null;
  for (let i = 0; i < 2000 && session.snapshot.phase !== 'arrived'; i++) {
    now += 1000;
    const snap = await session.onFix(sim.step(now));
    limits.add(snap.progress?.speedLimitKmh ?? null);
    if (snap.alert && !alerted) {
      alerted = snap.alert.report.id;
      const vote = ok(await api.POST('/v1/reports/{id}/votes', { params: { path: { id: alerted } }, body: { stillThere: true } }), 'vote');
      session.dismissAlert(alerted);
      said.push(`[voted still there → confidence ${vote.confidence}]`);
    }
  }
  await session.end();
  const done = ok(await api.PATCH('/v1/trips/{id}', { params: { path: { id: trip.tripId } }, body: { status: 'finished' } }), 'finish');

  console.log(`route: ${routes.length} options, ${route.distanceM} m, ${Math.round(route.durationS / 60)} min → ${dest.name}`);
  console.log('spoken:\n  ' + said.join('\n  '));
  console.log(`eta checks: ${etaChecks} · speed limits seen: ${[...limits].join(', ')}`);
  console.log(`probes uploaded: ${probesSent} fixes · alert for police: ${alerted === police.id} · trip: ${done.status} · phase: ${session.snapshot.phase}`);
  if (session.snapshot.phase !== 'arrived' || alerted !== police.id || probesSent === 0 || etaChecks === 0 || !limits.has(50)) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
