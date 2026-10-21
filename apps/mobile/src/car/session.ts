/**
 * CarPlay / Android Auto. Loaded only in builds made with WAYLINE_CAR=1 (see ./index.ts) — the
 * native module isn't linked otherwise, and importing the library without it would throw.
 *
 * The car screen mirrors the phone's navigation state (the shared zustand store):
 *   idle        map + Home / Work buttons that plan and start a drive
 *   navigating  maneuver + distance, ETA / remaining, "then" maneuver, End button
 *   rerouting   CarPlay pause / Android Auto loading state
 *   arrived     session finished, back to idle
 */
import {
  AlertTemplate, AndroidAutoManeuverType, CarPlay, ManeuverType, MapTemplate, NavigationTemplate, PauseReason, Trip,
  type AndroidAction, type AndroidTravelEstimates, type Maneuver, type NavigationInfo,
} from '@g4rb4g3/react-native-carplay';
import { AppRegistry, Platform, type ImageSourcePropType } from 'react-native';
import {
  androidAutoManeuverType, carGuidance, carPlayManeuverType, type CarGuidance, type CarIcon, type CarManeuver,
} from '@wayline/navigation-core';
import { getAccessToken } from '@/api/auth';
import { savedPlaces } from '@/api/wayline';
import { lang, t } from '@/i18n';
import { watchIdle } from '@/location/location';
import { endDrive, planTo, startDrive } from '@/nav/drive';
import { get, set, useApp } from '@/state/store';
import { CarMap } from './CarMap';

const ICONS: Record<CarIcon, ImageSourcePropType> = {
  right: require('../../assets/car/right.png'),
  left: require('../../assets/car/left.png'),
  straight: require('../../assets/car/straight.png'),
  uturn: require('../../assets/car/uturn.png'),
  roundabout: require('../../assets/car/roundabout.png'),
  flag: require('../../assets/car/flag.png'),
};

/** Units are always metric in Israel; `distanceRemaining` is in kilometres per the templates. */
const km = (m: number) => Math.round(m / 100) / 10;

// ---------- shared ----------

async function ensureReady() {
  // The car can start before the phone UI ever mounted (Android Auto launches the JS headless).
  const s = get();
  if (s.saved.length === 0) {
    await getAccessToken().catch(() => undefined);
    await savedPlaces().then((saved) => set({ saved })).catch(() => undefined);
  }
  if (!get().position) {
    // one fix is enough to plan from; the phone UI (or the drive) owns continuous tracking
    let stop: (() => void) | undefined;
    let got = false;
    stop = await watchIdle((fix) => {
      set({ position: fix });
      got = true;
      stop?.();
    }).catch(() => undefined);
    if (got) stop?.();
  }
}

async function driveTo(kind: 'home' | 'work') {
  await ensureReady();
  const place = get().saved.find((p) => p.kind === kind);
  if (!place) return false;
  await planTo({ name: place.name, address: place.address ?? undefined, lat: place.lat, lng: place.lng });
  if (get().routes.length === 0) return false;
  await startDrive();
  return true;
}

function guidance(): CarGuidance | null {
  const nav = get().nav;
  return nav ? carGuidance(nav, lang()) : null;
}

// ---------- CarPlay ----------

function carPlaySession() {
  let trip: Trip | null = null;
  let navigating = false;
  let paused = false;
  let lastManeuverKey = '';

  const map: MapTemplate = new MapTemplate({
    component: CarMap,
    tripEstimateStyle: 'dark',
    leadingNavigationBarButtons: idleButtons(),
    trailingNavigationBarButtons: [],
    onBarButtonPressed: ({ id }) => {
      if (id === 'home' || id === 'work') {
        void driveTo(id).then((ok) => { if (!ok) noPlacesAlert(); });
      }
      if (id === 'end') endDrive();
    },
    onDidCancelNavigation: () => endDrive(),
  });

  function noPlacesAlert() {
    CarPlay.presentTemplate(new AlertTemplate({
      titleVariants: [t('carSetPlaces')],
      actions: [{ id: 'ok', title: 'OK' }],
      onActionButtonPressed: () => CarPlay.dismissTemplate(),
    }));
  }

  function idleButtons() {
    return [
      { id: 'home', type: 'text' as const, title: t('home') },
      { id: 'work', type: 'text' as const, title: t('work') },
    ];
  }

  function cpManeuver(m: CarManeuver): Maneuver {
    return {
      symbolImage: ICONS[m.icon],
      tintSymbolImage: '#FFFFFF',
      instructionVariants: [m.instruction, m.shortInstruction],
      maneuverType: carPlayManeuverType(m.kind) as ManeuverType,
      trafficSide: 0, // right-hand traffic
      initialTravelEstimates: { distanceRemaining: km(m.distanceM), timeRemaining: 0, distanceUnits: 'kilometers' },
    };
  }

  function update() {
    const g = guidance();
    if (!g || g.state === 'arrived') {
      if (navigating) {
        map.finishNavigationSession();
        navigating = false;
        trip = null;
        lastManeuverKey = '';
        map.updateConfig({ ...map.config, leadingNavigationBarButtons: idleButtons(), trailingNavigationBarButtons: [] });
      }
      return;
    }
    const nav = get().nav!;
    if (!navigating) {
      const dest = get().destination;
      const origin = nav.progress?.snapped ?? get().position;
      if (!dest || !origin) return;
      trip = new Trip({
        origin: { latitude: origin.lat, longitude: origin.lng, name: '' },
        destination: { latitude: dest.lat, longitude: dest.lng, name: dest.name },
        routeChoices: [{ summaryVariants: [dest.name] }],
      });
      void map.startNavigationSession(trip);
      navigating = true;
      map.updateConfig({ ...map.config, leadingNavigationBarButtons: [], trailingNavigationBarButtons: [{ id: 'end', type: 'text', title: t('endDrive') }] });
    }
    if (g.state === 'rerouting') {
      if (!paused) { map.pauseNavigationSession(PauseReason.Rerouting, t('carRerouting')); paused = true; }
      return;
    }
    paused = false;

    // Only push new maneuvers when the upcoming one changes; distances update via travel estimates.
    const key = `${g.maneuver?.instruction}|${g.then?.instruction}`;
    if (g.maneuver && key !== lastManeuverKey) {
      lastManeuverKey = key;
      map.updateManeuvers([g.maneuver, ...(g.then ? [g.then] : [])].map(cpManeuver));
    }
    if (g.maneuver) {
      map.updateTravelEstimates(0, { distanceRemaining: km(g.maneuver.distanceM), timeRemaining: 0, distanceUnits: 'kilometers' });
    }
    if (trip) {
      map.updateTravelEstimatesForTrip(trip, { distanceRemaining: km(g.remainingDistanceM), timeRemaining: g.remainingS, distanceUnits: 'kilometers' });
    }
  }

  CarPlay.setRootTemplate(map);
  update();
  return update;
}

// ---------- Android Auto ----------

function androidAutoSession() {
  const end: AndroidAction = { title: t('endDrive'), onPress: () => endDrive() };
  const home: AndroidAction = { title: t('home'), onPress: () => void start('home') };
  const work: AndroidAction = { title: t('work'), onPress: () => void start('work') };

  const template = new NavigationTemplate({
    component: CarMap,
    actions: [home, work],
    onAutoDriveEnabled: () => undefined,
    onDidCancelNavigation: () => endDrive(),
  });
  let navigating = false;

  async function start(kind: 'home' | 'work') {
    const ok = await driveTo(kind);
    if (!ok) template.updateTemplate({ ...template.config, navigationInfo: { type: 'messageInfo', title: t('carSetPlaces') } });
  }

  function step(m: CarManeuver) {
    const type = androidAutoManeuverType(m.kind) as Exclude<AndroidAutoManeuverType, 32 | 33 | 34 | 35>;
    return { cue: m.instruction, road: m.road ?? undefined, maneuver: { type, image: ICONS[m.icon] } };
  }

  function update() {
    const g = guidance();
    if (!g || g.state === 'arrived') {
      if (navigating) {
        navigating = false;
        template.navigationEnded();
        template.updateTemplate({ component: CarMap, actions: [home, work], onAutoDriveEnabled: () => undefined, onDidCancelNavigation: () => endDrive() });
      }
      return;
    }
    if (!navigating) { navigating = true; template.navigationStarted(); }

    let navigationInfo: NavigationInfo;
    if (g.state === 'rerouting' || !g.maneuver) navigationInfo = { type: 'routingInfo', loading: true };
    else {
      navigationInfo = {
        type: 'routingInfo',
        distance: g.maneuver.distanceM,
        distanceUnits: 'meters',
        step: step(g.maneuver),
        nextStep: g.then ? step(g.then) : undefined,
      };
    }
    const travelEstimate: AndroidTravelEstimates = {
      distanceRemaining: km(g.remainingDistanceM),
      distanceUnits: 'kilometers',
      timeRemaining: g.remainingS,
      destinationTime: { timeSinceEpochMillis: g.etaEpochMs, id: Intl.DateTimeFormat().resolvedOptions().timeZone },
    };
    template.updateTemplate({ ...template.config, actions: [end], navigationInfo, travelEstimate });
  }

  CarPlay.setRootTemplate(template);
  update();
  return update;
}

// ---------- lifecycle ----------

let unsubscribe: (() => void) | null = null;

function onConnect() {
  unsubscribe?.();
  const update = Platform.OS === 'ios' ? carPlaySession() : androidAutoSession();
  // nav snapshots arrive with every GPS fix (~1 Hz); the head unit is fine with that rate.
  unsubscribe = useApp.subscribe((s, prev) => {
    if (s.nav !== prev.nav || s.screen !== prev.screen) update();
  });
  void ensureReady();
}

function onDisconnect() {
  unsubscribe?.();
  unsubscribe = null;
}

export function startCarSession() {
  if (Platform.OS === 'android') {
    // The Android Auto service starts these JS apps on its own (headless) surfaces; the UI itself
    // comes from the templates set in onConnect, so they render nothing.
    AppRegistry.registerComponent('AndroidAuto', () => () => null);
    AppRegistry.registerComponent('AndroidAutoCluster', () => () => null);
  }
  CarPlay.registerOnConnect(onConnect);
  CarPlay.registerOnDisconnect(onDisconnect);
  if (CarPlay.connected) onConnect();
}
