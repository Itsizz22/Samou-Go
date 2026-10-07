import { describe, expect, it } from 'vitest';
import { isWithinStoreHours } from './operating-hours';

describe('Palestine operating hours', () => {
  const store = { openingTime: '08:00', closingTime: '21:00' };
  it('includes opening and excludes closing exactly', () => {
    expect(isWithinStoreHours(store, new Date('2026-10-05T07:59:59+03:00'))).toBe(false);
    expect(isWithinStoreHours(store, new Date('2026-10-05T08:00:00+03:00'))).toBe(true);
    expect(isWithinStoreHours(store, new Date('2026-10-05T20:59:59+03:00'))).toBe(true);
    expect(isWithinStoreHours(store, new Date('2026-10-05T21:00:00+03:00'))).toBe(false);
  });
  it('handles shifts spanning midnight', () => {
    const night = { openingTime: '20:00', closingTime: '02:00' };
    for (const hour of ['20:00', '23:59', '00:00', '01:59']) expect(isWithinStoreHours(night, new Date(`2026-10-05T${hour}:00+03:00`))).toBe(true);
    expect(isWithinStoreHours(night, new Date('2026-10-05T02:00:00+03:00'))).toBe(false);
  });
  it('keeps missing hours and 24 hour schedules unrestricted', () => {
    expect(isWithinStoreHours({})).toBe(true);
    expect(isWithinStoreHours({ openingTime: '08:00' })).toBe(true);
    expect(isWithinStoreHours({ openingTime: '00:00', closingTime: '00:00' })).toBe(true);
  });
  it('uses Palestine winter offset rather than the machine timezone', () => {
    expect(isWithinStoreHours(store, new Date('2026-12-01T05:59:00Z'))).toBe(false);
    expect(isWithinStoreHours(store, new Date('2026-12-01T06:00:00Z'))).toBe(true);
  });
});
