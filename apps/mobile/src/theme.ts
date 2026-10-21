/** Design tokens — same values as the design canvas. */
export const colors = {
  ink: '#0F172A',
  sub: '#475569',
  muted: '#64748B',
  line: '#E2E8F0',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F5F9',
  surfaceSoft: '#F8FAFC',
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  primarySoft: '#DBEAFE',
  primaryTint: '#EFF6FF',
  route: '#2563EB',
  routeAlt: '#94A3B8',
  report: '#C2410C',
  success: '#15803D',
  successSoft: '#DCFCE7',
  danger: '#B91C1C',
  warning: '#B45309',
  scrim: 'rgba(15,23,42,0.45)',
} as const;

export const reportColors: Record<string, string> = {
  traffic: '#B45309',
  police: '#1D4ED8',
  crash: '#B91C1C',
  hazard: '#C2410C',
  closure: '#475569',
  camera: '#0F766E',
};


export const radius = { sheet: 24, card: 16, button: 14, pill: 999 } as const;

export const shadow = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.15,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 6,
} as const;

export const type = {
  title: { fontSize: 20, fontWeight: '800' as const, color: colors.ink },
  body: { fontSize: 16, color: colors.ink },
  label: { fontSize: 13, color: colors.muted },
};
