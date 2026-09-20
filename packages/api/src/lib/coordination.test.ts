import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }));
vi.mock('../config/env', () => ({ env: { isProduction: true, jwt: { secret: 'test-only-shared-secret' } } }));
vi.mock('./prisma', () => ({ prisma: { $queryRaw: h.query, $executeRaw: h.execute } }));
import { withJobLease } from './job-lease';
import { PostgresRateLimitStore } from './shared-rate-limit';
beforeEach(() => { vi.resetAllMocks(); h.execute.mockResolvedValue(1); });
afterEach(() => { vi.useRealTimers(); });
describe('shared protection failure handling', () => {
  it('fails closed if shared counters are unavailable', async () => {
    h.query.mockRejectedValue(new Error('private database failure'));
    await expect(new PostgresRateLimitStore('auth').increment('private-ip')).rejects.toMatchObject({
      statusCode: 503, code: 'RATE_LIMIT_UNAVAILABLE',
    });
  });
  it('does not run a task owned by another replica', async () => {
    h.query.mockResolvedValue([]);
    const work = vi.fn();
    expect(await withJobLease('job', work)).toBe(false);
    expect(work).not.toHaveBeenCalled();
  });
  it('releases ownership even after a task fails', async () => {
    h.query.mockResolvedValue([{ id: 'job' }]);
    await expect(withJobLease('job', async () => { throw new Error('task failed'); })).rejects.toThrow('task failed');
    expect(h.execute).toHaveBeenCalledTimes(1);
  });
  it('stops further work if renewal loses ownership', async () => {
    vi.useFakeTimers();
    h.query.mockResolvedValue([{ id: 'job' }]);
    h.execute.mockResolvedValue(0);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const result = withJobLease('job', async assertActive => { await gate; assertActive(); });
    const checked = expect(result).rejects.toThrow('ownership lost');
    await vi.advanceTimersByTimeAsync(20_000);
    release();
    await checked;
    expect(h.execute).toHaveBeenCalledTimes(2);
  });
});
