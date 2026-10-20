import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { Language, LatLng } from '@wayline/navigation-core';

const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string; mapStyleUrl?: string; variant?: string };

/** Android emulators reach the host machine at 10.0.2.2. */
const localApi = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

export const config = {
  apiUrl: (extra.apiUrl || localApi).replace(/\/$/, ''),
  mapStyleUrl: extra.mapStyleUrl || 'https://tiles.openfreemap.org/styles/liberty',
  variant: extra.variant ?? 'development',
  language: 'en' as Language,
  /** Used before the first GPS fix, and as the origin for simulated drives without GPS (dev only). */
  fallbackCenter: { lat: 32.0853, lng: 34.7818 } as LatLng,
};

export const isDevBuild = __DEV__ || config.variant === 'development';
