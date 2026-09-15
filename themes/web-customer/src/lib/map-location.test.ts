import { afterEach, describe, expect, it, vi } from 'vitest';
import { validMapPoint, mapboxPoint, routeGeoJSON } from '@samou-go/ui/map';
import { readSavedAddresses, writeSavedAddresses, upsertAddress } from './address-book';
afterEach(() => vi.unstubAllGlobals());
describe('mapping and saved destination invariants', () => {
  it('uses longitude first only at the GeoJSON boundary', () => {
    expect(mapboxPoint([31.4, 35.1])).toEqual([35.1, 31.4]);
    expect(routeGeoJSON([[31.4,35.1],[31.5,35.2]]).features[0]?.geometry.coordinates).toEqual([[35.1,31.4],[35.2,31.5]]);
  });
  it('rejects malformed routes without drawing a straight line across gaps', () => {
    for (const point of [[NaN,35], [91,35], [31,181], [Infinity,0]]) expect(validMapPoint(point)).toBe(false);
    expect(validMapPoint([0,0])).toBe(true);
    expect(routeGeoJSON([[31,35],[NaN,35],[32,36]]).features).toEqual([]);
    expect(routeGeoJSON([]).features).toEqual([]);
  });
  it('isolates accounts and retains the destination snapshot when an address changes', () => {
    const data = new Map<string,string>();
    vi.stubGlobal('localStorage', { getItem: (key:string) => data.get(key), setItem: (key:string,value:string) => data.set(key,value) });
    const original = { id:'home',label:'Home',addressText:'Location A',lat:31.4,lng:35.1 };
    writeSavedAddresses([original], 'customer-a');
    expect(readSavedAddresses('customer-b')).toEqual([]);
    expect(readSavedAddresses()).toEqual([]);
    const snapshot = { ...readSavedAddresses('customer-a')[0] };
    writeSavedAddresses(upsertAddress(readSavedAddresses('customer-a'), { ...original, addressText:'Location B',lat:31.5,lng:35.2 }), 'customer-a');
    expect(snapshot.lat).toBe(31.4);
    expect(readSavedAddresses('customer-a')[0]?.lat).toBe(31.5);
    data.set('samou-go.addresses.v1:customer-b', JSON.stringify([{ ...original,lat:999 }]));
    expect(readSavedAddresses('customer-b')).toEqual([]);
  });
});

