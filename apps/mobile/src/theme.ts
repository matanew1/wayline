import { useColorScheme, useWindowDimensions, type ViewStyle } from 'react-native';
import { useSettings, type ThemePref } from '@/state/settings';

/**
 * Design tokens — the "Wayline UI" sheet on the design canvas. Calm surfaces, one violet primary;
 * color is reserved for the route, reports and things that need attention.
 */
export interface Palette {
  dark: boolean;
  ink: string;
  sub: string;
  muted: string;
  surface: string;
  surface2: string;
  page: string;
  line: string;
  handle: string;
  primary: string;
  primaryDeep: string;
  primarySoft: string;
  onPrimary: string;
  danger: string;
  dangerSoft: string;
  dangerInk: string;
  success: string;
  successSoft: string;
  infoSoft: string;
  infoInk: string;
  route: string;
  routeAlt: string;
  routeCasing: string;
  mapBg: string;
  scrim: string;
  shadow: string;
}

export const LIGHT: Palette = {
  dark: false,
  ink: '#1B1838',
  sub: '#5A5675',
  muted: '#6E6A86',
  surface: '#FFFFFF',
  surface2: '#F3F1F8',
  page: '#F6F5F9',
  line: '#E4E0EE',
  handle: '#D9D4E8',
  primary: '#5B3DF5',
  primaryDeep: '#4327D9',
  primarySoft: '#EFEBFF',
  onPrimary: '#FFFFFF',
  danger: '#E5484D',
  dangerSoft: '#FCE8E8',
  dangerInk: '#B4232A',
  success: '#137A4B',
  successSoft: '#DDF6EA',
  infoSoft: '#DCEFFD',
  infoInk: '#0B5E9A',
  route: '#5B3DF5',
  routeAlt: '#B9B2E4',
  routeCasing: '#FFFFFF',
  mapBg: '#EEF0F3',
  scrim: 'rgba(27,24,56,0.4)',
  shadow: '#1B1838',
};

export const DARK: Palette = {
  dark: true,
  ink: '#F4F2FF',
  sub: '#BDB8DB',
  muted: '#9C96CC',
  surface: '#26223F',
  surface2: '#322D55',
  page: '#17152B',
  line: '#3A3560',
  handle: '#4E4790',
  primary: '#6A4DFF',
  primaryDeep: '#4F33E0',
  primarySoft: '#2E2766',
  onPrimary: '#FFFFFF',
  danger: '#E5484D',
  dangerSoft: '#3A1E2A',
  dangerInk: '#FF9C9F',
  success: '#4BD69A',
  successSoft: '#173B2E',
  infoSoft: '#16314A',
  infoInk: '#8CCBF5',
  route: '#7B63FF',
  routeAlt: '#5E569C',
  routeCasing: '#17152B',
  mapBg: '#1D1A3A',
  scrim: 'rgba(0,0,0,0.55)',
  shadow: '#000000',
};

/** Light fills with ink text/icons — every pairing passes contrast. Used for report pins and icons only. */
export const reportColors: Record<string, string> = {
  police: '#4CC3FF',
  crash: '#FF7A59',
  hazard: '#FF9F1C',
  traffic: '#FFC93C',
  closure: '#C3B5FF',
  camera: '#3DDC97',
};
export const REPORT_INK = '#1B1838';

/** Figtree, loaded in the root layout. Custom fonts ignore fontWeight on Android, so pick the face. */
export const fonts = {
  regular: 'Figtree_500Medium',
  semibold: 'Figtree_600SemiBold',
  bold: 'Figtree_700Bold',
  heavy: 'Figtree_800ExtraBold',
} as const;

export const radius = { sheet: 30, card: 24, tile: 20, button: 18, chip: 999 } as const;

export function elevation(c: Palette, level: 'sm' | 'md' = 'md'): ViewStyle {
  return level === 'md'
    ? { shadowColor: c.shadow, shadowOpacity: c.dark ? 0.35 : 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 }
    : { shadowColor: c.shadow, shadowOpacity: c.dark ? 0.25 : 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 };
}

export function resolveTheme(pref: ThemePref, system: 'light' | 'dark' | null | undefined): Palette {
  if (pref === 'dark') return DARK;
  if (pref === 'light') return LIGHT;
  return system === 'dark' ? DARK : LIGHT;
}

/** The active palette: the Theme setting, or the phone's appearance when set to Auto. */
export function useTheme(): Palette {
  const pref = useSettings((s) => s.theme);
  const system = useColorScheme();
  return resolveTheme(pref, system);
}

/** Phones get top card + bottom sheet; 600dp+ wide (tablets, landscape) a 400dp side panel. */
export const WIDE_MIN_DP = 600;
export const PANEL_WIDTH = 400;
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const wide = width >= WIDE_MIN_DP;
  return { wide, width, height, panelWidth: wide ? Math.min(PANEL_WIDTH, Math.round(width * 0.45)) : width };
}

/** Light palette for code outside React (the car screen renders its own map). */
export const colors = LIGHT;
