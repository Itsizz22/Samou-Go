import { describe, expect, it } from 'vitest';
import { storeLocalDateTime, storeTimeToIso } from './store-time';

describe('store wall clock conversion', () => {
  it('converts summer and winter independently of device timezone', () => {
    expect(storeTimeToIso('2026-09-14T10:00')).toBe('2026-09-14T07:00:00.000Z');
    expect(storeTimeToIso('2026-01-14T10:00')).toBe('2026-01-14T08:00:00.000Z');
  });
  it('round trips the chosen date without changing minutes', () => {
    const value = '2026-09-15T23:45';
    expect(storeLocalDateTime(new Date(storeTimeToIso(value)!))).toBe(value);
  });
  it('rejects incomplete and impossible dates', () => {
    expect(storeTimeToIso('')).toBeUndefined();
    expect(storeTimeToIso('2026-02-31T10:00')).toBeUndefined();
  });
});
