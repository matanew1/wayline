import type { ConfigContext, ExpoConfig } from 'expo/config';

/** APP_VARIANT=development | preview | production (set per EAS build profile). */
const variant = process.env.APP_VARIANT ?? 'development';
const isDev = variant === 'development';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: isDev ? 'Wayline Dev' : 'Wayline',
  slug: 'wayline',
  scheme: 'wayline',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: isDev ? 'com.wayline.app.dev' : 'com.wayline.app',
    supportsTablet: false,
    infoPlist: {
      // Voice guidance keeps playing with the screen off / app in background.
      UIBackgroundModes: ['location', 'audio'],
    },
  },
  android: {
    package: isDev ? 'com.wayline.app.dev' : 'com.wayline.app',
    adaptiveIcon: {
      backgroundColor: '#2563EB',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
    // Added by React Native templates but unused — they trigger extra Play Store review.
    blockedPermissions: ['android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE', 'android.permission.SYSTEM_ALERT_WINDOW'],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    // Hebrew UI: allow right-to-left layout (switched at runtime by the language setting)
    ['expo-localization', { supportsRTL: true }],
    '@maplibre/maplibre-react-native',
    [
      'expo-location',
      {
        locationWhenInUsePermission: 'Wayline uses your location to show where you are and guide you turn by turn.',
        locationAlwaysAndWhenInUsePermission:
          'Allow location while driving so guidance keeps working when your screen is off or you switch apps.',
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    // Dev builds talk to a local API over plain HTTP.
    ['expo-build-properties', { android: { usesCleartextTraffic: isDev } }],
  ],
  // Localised system strings (permission prompts, app name)
  locales: { en: './locales/en.json', he: './locales/he.json' },
  experiments: { typedRoutes: true },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    mapStyleUrl: process.env.EXPO_PUBLIC_MAP_STYLE_URL,
    variant,
  },
});
