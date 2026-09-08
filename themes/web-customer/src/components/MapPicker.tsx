import { lazy, Suspense } from 'react';
import { FEATURE_FLAGS } from '@samou-go/api-client';
import type { MapPickerProps } from './MapPickerImpl';
export type { MapPickerProps } from './MapPickerImpl';
const Picker = lazy(() =>
  import('./MapPickerImpl').then(module => ({ default: module.MapPicker }))
);
export function MapPicker(props: MapPickerProps) {
  if (!FEATURE_FLAGS.ENABLE_LIVE_GPS_TRACKING || !props.isOpen) return null;
  return (
    <Suspense fallback={null}>
      <Picker {...props} />
    </Suspense>
  );
}
