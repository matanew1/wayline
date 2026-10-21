import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { LatLng } from '@wayline/navigation-core';

const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string; mapStyleUrl?: string; variant?: string; car?: boolean };

/** Android emulators reach the host machine at 10.0.2.2. */
const localApi = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

export const config = {
  apiUrl: (extra.apiUrl || localApi).replace(/\/$/, ''),
  /** Explicit override; otherwise the API serves the style (our tiles, or a redirect to OpenFreeMap). */
  mapStyleUrl: extra.mapStyleUrl || null,
  variant: extra.variant ?? 'development',
  /** CarPlay / Android Auto linked into this build (WAYLINE_CAR=1). */
  car: extra.car === true,
  /** Used before the first GPS fix, and as the origin for simulated drives without GPS (dev only). */
  fallbackCenter: { lat: 32.0853, lng: 34.7818 } as LatLng,
};

export const isDevBuild = __DEV__ || config.variant === 'development';
