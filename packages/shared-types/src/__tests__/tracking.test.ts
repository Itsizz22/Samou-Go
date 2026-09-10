import { describe, expect, it } from 'vitest';
import { directDistanceMeters } from '../tracking';
describe('direct distance', () => {
  it('returns zero at the destination and approximately 111 km per latitude degree', () => {
    expect(directDistanceMeters({ lat: 31.4, lng: 35.06 }, { lat: 31.4, lng: 35.06 })).toBe(0);
    expect(directDistanceMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeGreaterThan(111000);
    expect(directDistanceMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeLessThan(112000);
  });
  it('rejects invalid positions and handles the date line', () => {
    expect(directDistanceMeters({ lat: 91, lng: 0 }, { lat: 0, lng: 0 })).toBeNull();
    expect(directDistanceMeters({ lat: NaN, lng: 0 }, { lat: 0, lng: 0 })).toBeNull();
    expect(directDistanceMeters({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 })).toBeLessThan(23000);
  });
});
