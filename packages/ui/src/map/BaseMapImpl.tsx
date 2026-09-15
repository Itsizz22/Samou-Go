/// <reference types="vite/client" />
import { useEffect, useRef, useState } from 'react';
import mapboxgl, { type GeoJSONSource } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { mapboxPoint, routeGeoJSON, validMapPoint, type BaseMapProps } from './map-data';

export default function BaseMapImpl(props: BaseMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const current = useRef(props); current.current = props;
  const pins = useRef(new Map<string, { marker: mapboxgl.Marker; element: HTMLButtonElement; frame: number }>());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const fitted = useRef('');
  const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
  useEffect(() => {
    if (!container.current || !token || !mapboxgl.supported()) return;
    if (mapboxgl.getRTLTextPluginStatus() === 'unavailable') mapboxgl.setRTLTextPlugin('https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-rtl-text/v0.3.0/mapbox-gl-rtl-text.js', undefined, true);
    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({ container: container.current, accessToken: token,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: mapboxPoint(validMapPoint(current.current.center) ? current.current.center : [31.3967, 35.0661]),
        zoom: current.current.zoom ?? 15, attributionControl: false,
      });
    } catch { setError('تعذر تشغيل الخريطة على هذا الجهاز.'); return; }
    mapRef.current = map;
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-left');
    map.on('load', () => {
      const brand = getComputedStyle(container.current!).getPropertyValue('--color-brand').trim() || 'teal';
      map.addSource('delivery-route', { type: 'geojson', data: routeGeoJSON(current.current.route ?? []) });
      map.addLayer({ id: 'delivery-route-outline', type: 'line', source: 'delivery-route', paint: { 'line-color': 'white', 'line-width': 8 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      map.addLayer({ id: 'delivery-route-line', type: 'line', source: 'delivery-route', paint: { 'line-color': brand, 'line-width': 4 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      setLoaded(true); setError('');
    });
    map.on('error', () => setError('تعذر تحميل الخريطة بالكامل. تحقق من الاتصال؛ يبقى العنوان متاحًا.'));
    map.on('click', event => current.current.onPick?.(event.lngLat.lat, event.lngLat.lng));
    const resize = new ResizeObserver(() => map.resize()); resize.observe(container.current);
    return () => {
      resize.disconnect();
      for (const pin of pins.current.values()) { cancelAnimationFrame(pin.frame); pin.marker.remove(); }
      pins.current.clear(); map.remove(); mapRef.current = null; setLoaded(false); fitted.current = '';
    };
  }, [token]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    (map.getSource('delivery-route') as GeoJSONSource | undefined)?.setData(routeGeoJSON(props.route ?? []));
    const visible = props.markers.filter(marker => validMapPoint(marker.position));
    const keys = new Set<string>();
    visible.forEach((entry, index) => {
      const key = entry.id ?? `${entry.kind ?? 'pin'}-${index}`; keys.add(key);
      let pin = pins.current.get(key);
      if (!pin) {
        const element = document.createElement('button'); element.type = 'button';
        element.className = 'samou-map-pin';
        const marker = new mapboxgl.Marker({ element, draggable: Boolean(props.onPick), anchor: 'bottom' }).setLngLat(mapboxPoint(entry.position)).addTo(map);
        pin = { element, marker, frame: 0 }; pins.current.set(key, pin);
        marker.on('dragend', () => { const point = marker.getLngLat(); current.current.onPick?.(point.lat, point.lng); });
      }
      pin.element.textContent = ({ store: '🏪', captain: '🛵', destination: '🏠', user: '●' })[entry.kind ?? 'destination'];
      pin.element.setAttribute('role', 'button'); pin.element.setAttribute('aria-label', entry.label); pin.element.title = entry.label;
      pin.element.style.opacity = entry.stale ? '0.5' : '1';
      pin.element.onclick = event => { event.stopPropagation(); current.current.onMarkerSelect?.(entry); };
      cancelAnimationFrame(pin.frame);
      const from = pin.marker.getLngLat(); const [lng, lat] = mapboxPoint(entry.position);
      const animate = entry.kind === 'captain' && !entry.stale && !matchMedia('(prefers-reduced-motion: reduce)').matches;
      const started = performance.now();
      const moving = pin;
      const step = (now: number) => {
        const progress = animate ? Math.min(1, (now - started) / 800) : 1;
        moving.marker.setLngLat([from.lng + (lng - from.lng) * progress, from.lat + (lat - from.lat) * progress]);
        if (progress < 1) moving.frame = requestAnimationFrame(step);
      };
      step(started);
    });
    for (const [key, pin] of pins.current) if (!keys.has(key)) { cancelAnimationFrame(pin.frame); pin.marker.remove(); pins.current.delete(key); }
    const fit = `${props.fitKey ?? 'initial'}:${routeGeoJSON(props.route ?? []).features.length > 0 ? 'route' : 'no-route'}:${visible.map(marker => marker.id ?? marker.kind ?? marker.label).join('|')}`;
    if (!props.onPick && visible.length && fitted.current !== fit) {
      const bounds = new mapboxgl.LngLatBounds();
      visible.forEach(marker => bounds.extend(mapboxPoint(marker.position)));
      if (routeGeoJSON(props.route ?? []).features.length) (props.route ?? []).forEach(point => bounds.extend(mapboxPoint(point)));
      map.fitBounds(bounds, { padding: { top: 56, bottom: 68, left: 42, right: 42 }, maxZoom: 16, duration: 0 });
      fitted.current = fit;
    }
    if (props.onPick && validMapPoint(props.center)) map.easeTo({ center: mapboxPoint(props.center), duration: 350 });
  }, [loaded, props.markers, props.route, props.fitKey, props.center, props.onPick]);
  const unavailable = !token ? 'الخريطة غير مهيأة حاليًا. يمكنك استخدام الموقع المحفوظ أو إدخال الإحداثيات.' : !mapboxgl.supported() ? 'جهازك لا يدعم عرض الخريطة. استخدم الموقع المحفوظ أو الإحداثيات.' : error;
  return <div className={`samou-map relative isolate overflow-hidden border border-line ${props.className ?? 'h-64 w-full rounded-2xl'}`}>
    <style>{`.samou-map-pin{width:44px;height:44px;border:2px solid white;border-radius:50%;background:var(--color-surface,white);color:var(--color-brand,teal);font-size:22px;cursor:pointer;box-shadow:0 2px 8px #0002}.samou-map-pin:focus-visible{outline:3px solid var(--color-brand,teal)}.samou-map .mapboxgl-ctrl button{width:40px;height:40px}.samou-map .mapboxgl-ctrl-attrib{font-size:10px;direction:ltr}.samou-map .mapboxgl-canvas{outline-offset:-3px}`}</style>
    <div ref={container} className="h-full w-full" aria-label="الخريطة" />
    {unavailable && <p role="status" className="absolute inset-x-2 top-2 rounded-xl bg-surface p-3 text-sm text-ink">{unavailable}</p>}
  </div>;
}
