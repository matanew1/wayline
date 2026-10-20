import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { RouteSimulator, type Fix } from '@wayline/navigation-core';

export const NAV_LOCATION_TASK = 'wayline-nav-location';

type Listener = (fix: Fix) => void;
const navListeners = new Set<Listener>();

export function toFix(l: Location.LocationObject): Fix {
  const c = l.coords;
  return {
    t: l.timestamp,
    lat: c.latitude,
    lng: c.longitude,
    speed: c.speed != null && c.speed >= 0 ? c.speed : null,
    heading: c.heading != null && c.heading >= 0 ? c.heading : null,
    acc: c.accuracy ?? null,
  };
}

/**
 * Background task: must be defined at module top level, and this module must be
 * imported from the app entry (_layout) so it exists when the OS wakes the JS runtime.
 */
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(NAV_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  for (const l of data.locations) {
    const fix = toFix(l);
    for (const fn of navListeners) fn(fix);
  }
});

export type PermissionState = 'granted' | 'foreground-only' | 'denied';

export async function ensureForegroundPermission(): Promise<boolean> {
  const cur = await Location.getForegroundPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  return (await Location.requestForegroundPermissionsAsync()).granted;
}

/** Ask for "Always" only when a drive starts — that's when the reason is obvious to the driver. */
async function ensureBackgroundPermission(): Promise<boolean> {
  try {
    const cur = await Location.getBackgroundPermissionsAsync();
    if (cur.granted) return true;
    if (!cur.canAskAgain) return false;
    return (await Location.requestBackgroundPermissionsAsync()).granted;
  } catch {
    return false; // e.g. Expo Go, where background location isn't available
  }
}

/** Low-power updates while browsing the map. */
export async function watchIdle(onFix: Listener): Promise<() => void> {
  const sub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 5 },
    (l) => onFix(toFix(l)),
  );
  return () => sub.remove();
}

export interface NavLocationSource {
  stop(): Promise<void>;
  /** Simulated sources follow a new route after a reroute. */
  followRoute?(polyline6: string): void;
  readonly kind: 'gps-background' | 'gps-foreground' | 'simulated';
}

/** 1 Hz navigation-grade updates that keep flowing with the screen off when "Always" is granted. */
export async function startNavGps(onFix: Listener): Promise<NavLocationSource> {
  navListeners.add(onFix);
  if (await ensureBackgroundPermission()) {
    await Location.startLocationUpdatesAsync(NAV_LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1000,
      distanceInterval: 0,
      activityType: Location.ActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Wayline is guiding you',
        notificationBody: 'Turn-by-turn navigation is active',
        notificationColor: '#2563EB',
      },
    });
    return {
      kind: 'gps-background',
      async stop() {
        navListeners.delete(onFix);
        if (await Location.hasStartedLocationUpdatesAsync(NAV_LOCATION_TASK)) await Location.stopLocationUpdatesAsync(NAV_LOCATION_TASK);
      },
    };
  }
  // "While using" only: guidance works while the app is open.
  const sub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
    (l) => onFix(toFix(l)),
  );
  return {
    kind: 'gps-foreground',
    async stop() {
      navListeners.delete(onFix);
      sub.remove();
    },
  };
}

/** Drives along the route at ~50 km/h — for development and demos. */
export function startSimulated(polyline6: string, onFix: Listener, speedMs = 14): NavLocationSource {
  let sim = new RouteSimulator(polyline6, { speedMs, noiseM: 3 });
  const timer = setInterval(() => {
    if (!sim.done) onFix(sim.step(Date.now()));
  }, 1000);
  return {
    kind: 'simulated',
    async stop() { clearInterval(timer); },
    followRoute(p) { sim = new RouteSimulator(p, { speedMs, noiseM: 3 }); },
  };
}
