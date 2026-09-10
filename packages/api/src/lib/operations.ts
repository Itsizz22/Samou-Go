/** Bounded per-process telemetry. No request URLs, bodies, tokens or user data. */
const startedAt = new Date().toISOString();
const incidents: { at: number; code: string }[] = [];
export function recordServerFailure(code: string): void {
  incidents.push({ at: Date.now(), code: /^[A-Z0-9_]{1,64}$/.test(code) ? code : 'INTERNAL_ERROR' });
  if (incidents.length > 100) incidents.shift();
}
export function getServerFailures() {
  const recent = incidents.filter(i => i.at >= Date.now() - 60 * 60_000);
  return { startedAt, scope: 'current-process-last-hour' as const, retainedLimit: 100, count: recent.length, last: recent.slice(-10).reverse().map(i => ({ code: i.code, at: new Date(i.at).toISOString() })) };
}
