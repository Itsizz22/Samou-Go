import { afterEach, expect, it, vi } from 'vitest';
const query = vi.hoisted(() => vi.fn());
vi.mock('./prisma', () => ({ prisma: { $queryRaw: query } }));
afterEach(() => { vi.useRealTimers(); vi.resetModules(); query.mockReset(); });
it('returns unavailable for database failure rather than exposing the error', async () => {
  query.mockRejectedValue(new Error('private connection string'));
  const { databaseReady } = await import('./readiness');
  expect(await databaseReady()).toBe(false);
});
it('times out and coalesces concurrent probes while the database is stalled', async () => {
  vi.useFakeTimers();
  query.mockReturnValue(new Promise(() => {}));
  const { databaseReady } = await import('./readiness');
  const first = databaseReady(); const second = databaseReady();
  await vi.advanceTimersByTimeAsync(3000);
  expect(await first).toBe(false); expect(await second).toBe(false);
  expect(query).toHaveBeenCalledTimes(1);
});
