import { Camera, GeoJSONSource, Layer, Map, Marker } from '@maplibre/maplibre-react-native';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { RouteGeometry, type LatLng } from '@wayline/navigation-core';
import { config } from '@/config';
import { lang } from '@/i18n';
import { useApp } from '@/state/store';
import { colors } from '@/theme';

const ll = (p: LatLng): [number, number] => [p.lng, p.lat];

/**
 * The map drawn on the car screen (CarPlay window / Android Auto surface). It renders in its own
 * React root, so it reads the shared store rather than props. No touch handling: car head units
 * drive panning through template buttons, and while navigating the camera follows the driver.
 */
export function CarMap() {
  const styleUrl = config.mapStyleUrl ?? `${config.apiUrl}/map/style.json?lang=${lang()}`;
  const nav = useApp((s) => s.nav);
  const position = useApp((s) => s.position);
  const polyline = nav?.route.polyline6;
  const geo = useMemo(() => (polyline ? new RouteGeometry(polyline) : null), [polyline]);
  const along = nav?.progress?.distanceAlongM ?? 0;

  const line = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: geo ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: geo.remainingFrom(along).map(ll) } }] : [],
  }), [geo, along]);

  const puck = nav?.progress?.snapped ?? position ?? config.fallbackCenter;
  const bearing = nav?.progress?.onRoute ? nav.progress.routeBearing : position?.heading ?? 0;

  return (
    <Map style={StyleSheet.absoluteFill} mapStyle={styleUrl} compass={false} logo={false} attribution={false}
      dragPan={false} touchZoom={false} touchRotate={false} touchPitch={false}>
      <Camera
        center={ll(puck)}
        zoom={nav ? 16 : 14.5}
        bearing={nav ? bearing : 0}
        pitch={nav ? 45 : 0}
        duration={800}
        easing="linear"
      />
      <GeoJSONSource id="car-route" data={line}>
        <Layer id="car-route-casing" type="line" layout={{ 'line-join': 'round', 'line-cap': 'round' }} paint={{ 'line-color': '#FFFFFF', 'line-width': 12 }} />
        <Layer id="car-route-line" type="line" layout={{ 'line-join': 'round', 'line-cap': 'round' }} paint={{ 'line-color': colors.route, 'line-width': 8 }} />
      </GeoJSONSource>
      <Marker id="car-me" lngLat={ll(puck)} anchor="center">
        <View>
          <Svg width={40} height={40} viewBox="0 0 40 40">
            <Circle cx={20} cy={20} r={18} fill={colors.primary} fillOpacity={0.18} />
            <Path d="M20 7 L30 31 L20 25 L10 31 Z" fill={colors.primary} stroke="#FFFFFF" strokeWidth={2.5} strokeLinejoin="round" />
          </Svg>
        </View>
      </Marker>
    </Map>
  );
}
