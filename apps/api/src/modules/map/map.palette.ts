/**
 * Basemap colors per theme, keyed by layer id in style.template.json. Matches the app's design
 * system (calm neutrals; color reserved for the route, reports and alerts).
 */
type Paint = Record<string, unknown>;
const roadBy = (major: string, other: string) => ['match', ['get', 'class'], ['motorway', 'trunk'], major, other];

export const PALETTES: Record<'light' | 'dark', Record<string, Paint>> = {
  light: {
    background: { 'background-color': '#EEF0F3' },
    'landcover-park': { 'fill-color': '#D3EBD3' },
    park: { 'fill-color': '#D3EBD3' },
    'landuse-residential': { 'fill-color': '#E8EBEF' },
    water: { 'fill-color': '#C6E3F3' },
    waterway: { 'line-color': '#C6E3F3' },
    building: { 'fill-color': '#E3E6EB', 'fill-outline-color': '#D9DDE4' },
    'road-casing': { 'line-color': roadBy('#E9C973', '#D9DDE4') },
    'road-fill': { 'line-color': roadBy('#FBE3A1', '#FFFFFF') },
    rail: { 'line-color': '#C4C9D3' },
    'boundary-country': { 'line-color': '#A0A6B4' },
    'road-label': { 'text-color': '#5A6070', 'text-halo-color': '#FFFFFF' },
    'water-label': { 'text-color': '#3B6E99', 'text-halo-color': '#EEF0F3' },
    'poi-label': { 'text-color': '#6B7080', 'text-halo-color': '#FFFFFF' },
    'place-minor': { 'text-color': '#6B7080', 'text-halo-color': '#EEF0F3' },
    'place-major': { 'text-color': '#1B1838', 'text-halo-color': '#EEF0F3' },
  },
  dark: {
    background: { 'background-color': '#1D1A3A' },
    'landcover-park': { 'fill-color': '#1F3B33' },
    park: { 'fill-color': '#1F3B33' },
    'landuse-residential': { 'fill-color': '#221F42' },
    water: { 'fill-color': '#173A5C' },
    waterway: { 'line-color': '#173A5C' },
    building: { 'fill-color': '#2A2650', 'fill-outline-color': '#332E5C' },
    'road-casing': { 'line-color': roadBy('#6B5520', '#141230') },
    'road-fill': { 'line-color': roadBy('#B98A1E', '#3B3672') },
    rail: { 'line-color': '#4A4578' },
    'boundary-country': { 'line-color': '#6E66B0' },
    'road-label': { 'text-color': '#C2BDE3', 'text-halo-color': '#1D1A3A' },
    'water-label': { 'text-color': '#7FB6E0', 'text-halo-color': '#1D1A3A' },
    'poi-label': { 'text-color': '#9C96CC', 'text-halo-color': '#1D1A3A' },
    'place-minor': { 'text-color': '#9C96CC', 'text-halo-color': '#1D1A3A' },
    'place-major': { 'text-color': '#F4F2FF', 'text-halo-color': '#1D1A3A' },
  },
};
