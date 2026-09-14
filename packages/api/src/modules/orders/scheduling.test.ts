import { describe, expect, it } from 'vitest';
import { validateScheduledStart } from './scheduling';

const now = new Date('2026-09-14T06:00:00Z');
const store = { acceptsScheduledOrders: true, openingTime: '10:00', closingTime: '22:00' };
describe('scheduled kitchen starts in Asia/Hebron', () => {
  it('allows ordinary orders when scheduling is disabled', () => {
    expect(validateScheduledStart(undefined, { ...store, acceptsScheduledOrders: false }, now)).toBeNull();
  });
  it('requires opt-in, hours, and a bounded lead time', () => {
    expect(() => validateScheduledStart('2026-09-14T10:00:00Z', { ...store, acceptsScheduledOrders: false }, now)).toThrow();
    expect(() => validateScheduledStart('2026-09-14T10:00:00Z', { ...store, openingTime: null }, now)).toThrow();
    expect(() => validateScheduledStart('2026-09-14T06:30:00Z', store, now)).toThrow();
    expect(() => validateScheduledStart('2026-09-22T10:00:00Z', store, now)).toThrow();
  });
  it('uses store timezone and excludes closing time', () => {
    expect(validateScheduledStart('2026-09-14T07:00:00Z', store, now)?.toISOString()).toBe('2026-09-14T07:00:00.000Z');
    expect(() => validateScheduledStart('2026-09-14T19:00:00Z', store, now)).toThrow();
  });
  it('handles hours crossing midnight', () => {
    const night = { ...store, openingTime: '20:00', closingTime: '02:00' };
    expect(validateScheduledStart('2026-09-14T22:00:00Z', night, now)).not.toBeNull();
    expect(() => validateScheduledStart('2026-09-14T12:00:00Z', night, now)).toThrow();
  });
});
