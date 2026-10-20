import { Camera, GeoJSONSource, Layer, Map, Marker, type CameraRef, type LngLatBounds } from '@maplibre/maplibre-react-native';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { RouteOption } from '@wayline/contracts';
import { decodePolyline, RouteGeometry, type LatLng } from '@wayline/navigation-core';
import { config } from '@/config';
import { useApp } from '@/state/store';
import { useT } from '@/i18n';
import { colors, reportColors } from '@/theme';

export interface WaylineMapHandle {
  recenter(): void;
}

const ll = (p: LatLng): [number, number] => [p.lng, p.lat];

function boundsOf(points: LatLng[]): LngLatBounds {
  let w = 180, s = 90, e = -180, n = -90;
  for (const p of points) { w = Math.min(w, p.lng); e = Math.max(e, p.lng); s = Math.min(s, p.lat); n = Math.max(n, p.lat); }
  return [w, s, e, n];
}

/**
 * The single map instance. Camera behaviour by screen:
 *  home    — free pan; recenter() / first fix ease to the driver
 *  preview — fit all route alternatives
 *  nav     — follow the snapped position, heading-up, tilted
 */
export const WaylineMap = forwardRef<WaylineMapHandle>(function WaylineMap(_, ref) {
  const { t } = useT();
  const camera = useRef<CameraRef>(null);
  const screen = useApp((s) => s.screen);
  const position = useApp((s) => s.position);
  const routes = useApp((s) => s.routes);
  const selectedId = useApp((s) => s.selectedRouteId);
  const nav = useApp((s) => s.nav);
  const destination = useApp((s) => s.destination);
  const reports = useApp((s) => s.reports);
  const centeredOnce = useRef(false);

  useImperativeHandle(ref, () => ({
    recenter() {
      const p = useApp.getState().position;
      if (p) camera.current?.easeTo({ center: ll(p), zoom: 15.5, bearing: 0, pitch: 0, duration: 600 });
    },
  }));

  useEffect(() => {
    if (screen === 'home' && position && !centeredOnce.current) {
      centeredOnce.current = true;
      camera.current?.jumpTo({ center: ll(position), zoom: 15 });
    }
  }, [screen, position]);

  // Route lines: all alternatives in preview, the remaining part of the active route while driving.
  const activePolyline = nav?.route.polyline6;
  const routeGeo = useMemo(() => (activePolyline ? new RouteGeometry(activePolyline) : null), [activePolyline]);
  const lines = useMemo<GeoJSON.FeatureCollection>(() => {
    if (screen === 'nav' && nav && routeGeo) {
      const along = nav.progress?.distanceAlongM ?? 0;
      return {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: { selected: true }, geometry: { type: 'LineString', coordinates: routeGeo.remainingFrom(along).map(ll) } }],
      };
    }
    if (screen === 'preview') {
      return {
        type: 'FeatureCollection',
        features: routes
          .map((r) => ({ r, sel: r.id === selectedId }))
          .sort((a, b) => Number(a.sel) - Number(b.sel)) // selected drawn last (on top)
          .map(({ r, sel }) => ({ type: 'Feature' as const, properties: { selected: sel }, geometry: { type: 'LineString' as const, coordinates: decodePolyline(r.polyline6).map(ll) } })),
      };
    }
    return { type: 'FeatureCollection', features: [] };
  }, [screen, nav, routeGeo, routes, selectedId]);

  // Slow / jammed stretches of the route being shown, from live traffic.
  const shownRoute = screen === 'nav' ? (nav?.route as RouteOption | undefined) : routes.find((r) => r.id === selectedId);
  const congestion = useMemo<GeoJSON.FeatureCollection>(() => {
    const spans = shownRoute?.traffic?.congestion ?? [];
    if (!shownRoute || spans.length === 0 || (screen !== 'nav' && screen !== 'preview')) return { type: 'FeatureCollection', features: [] };
    const geo = new RouteGeometry(shownRoute.polyline6);
    const k = shownRoute.distanceM > 0 ? geo.lengthM / shownRoute.distanceM : 1;
    const from = screen === 'nav' ? (nav?.progress?.distanceAlongM ?? 0) : 0;
    return {
      type: 'FeatureCollection',
      features: spans
        .map((s) => ({ ...s, a: Math.max(s.fromM * k, from), b: s.toM * k }))
        .filter((s) => s.b > s.a)
        .map((s) => {
          const coords: [number, number][] = [ll(geo.pointAt(s.a).point)];
          const endIdx = geo.pointAt(s.b).segIndex;
          for (let i = geo.pointAt(s.a).segIndex + 1; i <= endIdx; i++) coords.push(ll(geo.points[i]));
          coords.push(ll(geo.pointAt(s.b).point));
          return { type: 'Feature' as const, properties: { level: s.level }, geometry: { type: 'LineString' as const, coordinates: coords } };
        }),
    };
  }, [shownRoute, screen, nav?.progress?.distanceAlongM]);

  const previewBounds = useMemo(() => {
    if (screen !== 'preview' || routes.length === 0) return null;
    return boundsOf(routes.flatMap((r) => decodePolyline(r.polyline6)));
  }, [screen, routes]);

  // While navigating, show the puck on the route (snapped) and point the map where we're going.
  const puck = screen === 'nav' && nav?.progress ? nav.progress.snapped : position;
  const heading = screen === 'nav' && nav?.progress?.onRoute ? nav.progress.routeBearing : position?.heading ?? 0;

  const cameraStop =
    screen === 'nav' && puck
      ? { center: ll(puck), zoom: 16.5, bearing: heading, pitch: 50, duration: 900, easing: 'linear' as const, padding: { top: 220, bottom: 140 } }
      : previewBounds
        ? { bounds: previewBounds, padding: { top: 120, bottom: 420, left: 48, right: 48 }, duration: 700, easing: 'ease' as const }
        : {};

  return (
    <Map style={StyleSheet.absoluteFill} mapStyle={config.mapStyleUrl} compass={false} logo attribution touchPitch={false}>
      <Camera ref={camera} initialViewState={{ center: ll(config.fallbackCenter), zoom: 13 }} {...cameraStop} />

      <GeoJSONSource id="routes" data={lines} lineMetrics>
        <Layer
          id="route-casing"
          type="line"
          layout={{ 'line-join': 'round', 'line-cap': 'round' }}
          paint={{ 'line-color': '#FFFFFF', 'line-width': ['case', ['get', 'selected'], 13, 9] }}
        />
        <Layer
          id="route-line"
          type="line"
          layout={{ 'line-join': 'round', 'line-cap': 'round' }}
          paint={{ 'line-color': ['case', ['get', 'selected'], colors.route, colors.routeAlt], 'line-width': ['case', ['get', 'selected'], 8, 6] }}
        />
      </GeoJSONSource>

      <GeoJSONSource id="congestion" data={congestion}>
        <Layer
          id="congestion-line"
          type="line"
          layout={{ 'line-join': 'round', 'line-cap': 'round' }}
          paint={{ 'line-color': ['match', ['get', 'level'], 'jam', colors.danger, '#EA580C'], 'line-width': 8 }}
        />
      </GeoJSONSource>

      {destination && screen !== 'home' && screen !== 'search' ? (
        <Marker id="destination" lngLat={ll(destination)} anchor="bottom">
          <Svg width={34} height={34} viewBox="0 0 24 24" accessibilityLabel="Destination">
            <Path d="M12 22s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 15.8 12 22 12 22z" fill={colors.danger} stroke="#FFFFFF" strokeWidth={1.5} />
            <Circle cx={12} cy={10.5} r={2.6} fill="#FFFFFF" />
          </Svg>
        </Marker>
      ) : null}

      {Object.values(reports).map((r) => (
        <Marker key={r.id} id={`report-${r.id}`} lngLat={[r.lng, r.lat]} anchor="bottom">
          <View style={[styles.pill, { backgroundColor: reportColors[r.type] ?? colors.sub }]} accessibilityLabel={t('type.' + r.type as 'type.police')}>
            <Text style={styles.pillText}>{t(`type.${r.type}` as 'type.police')}</Text>
          </View>
        </Marker>
      ))}

      {puck ? (
        <Marker id="me" lngLat={ll(puck)} anchor="center">
          <View style={{ transform: [{ rotate: `${screen === 'nav' ? 0 : heading}deg` }] }} accessibilityLabel="Your position">
            <Svg width={44} height={44} viewBox="0 0 40 40">
              <Circle cx={20} cy={20} r={18} fill={colors.primary} fillOpacity={0.18} />
              <Path d="M20 7 L30 31 L20 25 L10 31 Z" fill={colors.primary} stroke="#FFFFFF" strokeWidth={2.5} strokeLinejoin="round" />
            </Svg>
          </View>
        </Marker>
      ) : null}
    </Map>
  );
});

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 2, borderColor: '#FFFFFF' },
  pillText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
});
