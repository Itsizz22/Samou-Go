/** Bounded, ephemeral diagnostics. Never store coordinates, tokens or message bodies here. */
type PilotEvent = { at: string; kind: 'gps' | 'dispatch'; captainId: string; orderId?: string; result: string; sampleAgeMs?: number; accuracyMeters?: number; activeOrders?: number; policy?: string };
const events: PilotEvent[] = [];
export function recordPilotEvent(event: Omit<PilotEvent, 'at'>): void {
  events.push({ ...event, at: new Date().toISOString() });
  if (events.length > 500) events.shift();
}
export function pilotEvents(orderId: string, captainId: string | null) {
  const since = Date.now() - 3600000;
  return { scope: 'current-process-last-hour', retainedLimit: 500,
    items: events.filter(event => Date.parse(event.at) >= since && (event.orderId === orderId || (event.kind === 'gps' && !event.orderId && event.captainId === captainId))).slice(-50) };
}
