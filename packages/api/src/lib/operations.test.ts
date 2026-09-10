import { expect, it } from 'vitest';
import { getServerFailures, recordServerFailure } from './operations';
it('bounds error storage and does not retain arbitrary sensitive messages', () => {
  recordServerFailure('password=private-value');
  expect(JSON.stringify(getServerFailures())).not.toContain('private-value');
  for (let i = 0; i < 150; i++) recordServerFailure('DATABASE_UNAVAILABLE');
  expect(getServerFailures().count).toBe(100);
  expect(getServerFailures().last).toHaveLength(10);
});
