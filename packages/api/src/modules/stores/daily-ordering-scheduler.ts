import { isPostgresProvider, prisma } from '../../lib/prisma';

/** Database owns Palestine time, snapshots, and multi-instance locking. */
export function startDailyOrderingScheduler(
  synchronize: () => Promise<unknown> = () => prisma.$queryRaw`SELECT samou_sync_daily_ordering_banner()`,
  enabled = isPostgresProvider,
): () => Promise<void> {
  if (!enabled) return async () => undefined;
  let stopped = false;
  let running: Promise<void> | undefined;
  const tick = () => {
    if (stopped || running) return;
    running = Promise.resolve().then(synchronize)
      .then(() => undefined)
      .catch(() => console.error('[daily-ordering] Availability synchronization failed; retrying in 30 seconds'))
      .finally(() => { running = undefined; });
  };
  const timer = setInterval(tick, 30_000);
  timer.unref();
  tick();
  return async () => { stopped = true; clearInterval(timer); await running; };
}
