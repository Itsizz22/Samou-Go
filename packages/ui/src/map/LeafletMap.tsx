import { lazy, Suspense } from "react";
import type { LeafletMapProps } from "./LeafletMapImpl";
export type { LeafletMapProps, LeafletMapMarker } from "./LeafletMapImpl";
const Map = lazy(() => import("./LeafletMapImpl"));
export function LeafletMap(props: LeafletMapProps) {
  return (
    <Suspense fallback={<div className={props.className} aria-busy="true" />}>
      <Map {...props} />
    </Suspense>
  );
}
export default LeafletMap;
