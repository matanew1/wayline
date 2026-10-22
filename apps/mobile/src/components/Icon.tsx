import { I18nManager } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** Stroke icons from the design (24×24 grid). */
const ICONS = {
  search: <><Circle cx="11" cy="11" r="7" /><Path d="M20 20l-4-4" /></>,
  back: <Path d="M15 18l-6-6 6-6" />,
  home: <><Path d="M3 11l9-7 9 7" /><Path d="M5 10v10h14V10" /></>,
  work: <><Rect x="3" y="7" width="18" height="13" rx="2" /><Path d="M9 7V5h6v2" /></>,
  clock: <><Circle cx="12" cy="12" r="9" /><Path d="M12 7v5l3 2" /></>,
  pin: <><Path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><Circle cx="12" cy="10" r="2.5" /></>,
  alert: <><Path d="M12 3l10 18H2z" /><Path d="M12 10v5" /><Path d="M12 18h.01" /></>,
  recenter: <><Circle cx="12" cy="12" r="7" /><Path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
  close: <Path d="M6 6l12 12M18 6L6 18" />,
  volume: <><Path d="M4 9v6h4l5 4V5L8 9z" /><Path d="M17 9a4 4 0 0 1 0 6" /><Path d="M19.5 6.5a8 8 0 0 1 0 11" /></>,
  mute: <><Path d="M4 9v6h4l5 4V5L8 9z" /><Path d="M17 9l5 6M22 9l-5 6" /></>,
  check: <Path d="M5 12l5 5L20 7" />,
  right: <><Path d="M6 20v-8a4 4 0 0 1 4-4h9" /><Path d="M15 4l4 4-4 4" /></>,
  left: <><Path d="M18 20v-8a4 4 0 0 0-4-4H5" /><Path d="M9 4L5 8l4 4" /></>,
  straight: <><Path d="M12 20V4" /><Path d="M7 9l5-5 5 5" /></>,
  uturn: <><Path d="M8 20V9a4 4 0 0 1 8 0v4" /><Path d="M12 10l4 4 4-4" /></>,
  roundabout: <><Circle cx="12" cy="9" r="4" /><Path d="M12 13v8" /><Path d="M16 9h4l-2-2" /></>,
  flag: <><Path d="M5 21V4" /><Path d="M5 4h12l-2 4 2 4H5" /></>,
  traffic: <><Path d="M5 15v-4l2-5h10l2 5v4" /><Path d="M3 15h18v3H3z" /></>,
  police: <Path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  crash: <Path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  hazard: <><Path d="M12 3l10 18H2z" /><Path d="M12 10v5" /><Path d="M12 18h.01" /></>,
  closure: <><Circle cx="12" cy="12" r="9" /><Path d="M5.6 5.6l12.8 12.8" /></>,
  camera: <><Path d="M3 8h4l2-3h6l2 3h4v11H3z" /><Circle cx="12" cy="13" r="3.5" /></>,
  settings: <><Circle cx="12" cy="12" r="3" /><Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  user: <><Circle cx="12" cy="8" r="4" /><Path d="M4 21a8 8 0 0 1 16 0" /></>,
  chevron: <Path d="M9 6l6 6-6 6" />,
  fast: <><Path d="M13 2L4 14h7l-1 8 9-12h-7z" /></>,
  plus: <Path d="M12 5v14M5 12h14" />,
  share: <><Circle cx="18" cy="5" r="2.5" /><Circle cx="6" cy="12" r="2.5" /><Circle cx="18" cy="19" r="2.5" /><Path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" /></>,
  arrowRight: <Path d="M5 12h14M13 6l6 6-6 6" />,
  car: <><Path d="M5 17h14M6 17l1.5-6h9L18 17" /><Circle cx="8" cy="18.5" r="1.5" /><Circle cx="16" cy="18.5" r="1.5" /></>,
  edit: <><Path d="M4 20h4L19 9l-4-4L4 16z" /><Path d="M13.5 6.5l4 4" /></>,
  slightRight: <><Path d="M8 20v-6l7-7" /><Path d="M10 7h5v5" /></>,
  slightLeft: <><Path d="M16 20v-6L9 7" /><Path d="M14 7H9v5" /></>,
} as const;

export type IconName = keyof typeof ICONS;

/** Icons that point "forward/back" mirror in right-to-left layouts; turn arrows never do. */
const DIRECTIONAL = new Set<IconName>(['back', 'chevron', 'arrowRight']);

export function Icon({ name, size = 22, color = '#0F172A', strokeWidth = 2 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  const flip = DIRECTIONAL.has(name) && I18nManager.isRTL;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={flip ? { transform: [{ scaleX: -1 }] } : undefined}>
      {ICONS[name]}
    </Svg>
  );
}

/** Maneuver kind (from the API) → arrow icon. */
export function maneuverIcon(kind: string | undefined): IconName {
  switch (kind) {
    case 'right': case 'slight_right': case 'sharp_right': case 'keep_right': case 'exit': return 'right';
    case 'left': case 'slight_left': case 'sharp_left': case 'keep_left': return 'left';
    case 'uturn': return 'uturn';
    case 'roundabout': return 'roundabout';
    case 'arrive': return 'flag';
    default: return 'straight';
  }
}

/** Lane arrow for one lane's painted indications (the first meaningful one wins). */
export function laneIcon(indications: string[]): IconName {
  for (const i of indications) {
    if (i === 'left' || i === 'sharp left') return 'left';
    if (i === 'right' || i === 'sharp right') return 'right';
    if (i === 'slight left') return 'slightLeft';
    if (i === 'slight right') return 'slightRight';
    if (i === 'uturn') return 'uturn';
  }
  return 'straight';
}
