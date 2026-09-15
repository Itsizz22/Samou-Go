import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
const source = readFileSync(new URL('../../../themes/web-customer/public/service-worker.js', import.meta.url), 'utf8');
function worker() {
  const handlers = new Map<string, (event: unknown) => void>();
  const showNotification = vi.fn(async () => {});
  const openWindow = vi.fn(async () => {});
  runInNewContext(source, { URL, Response, Date, self: {
    location: { origin: 'https://customer.example' },
    addEventListener: (event: string, handler: (event: unknown) => void) => handlers.set(event, handler),
    registration: { showNotification }, clients: { matchAll: async () => [], openWindow },
  } });
  return { handlers, showNotification, openWindow };
}
it('displays a generic lock-screen update without leaking notification body or phone', async () => {
  const w = worker(); let work: Promise<void> | undefined;
  w.handlers.get('push')!({ data: { json: () => ({ data: { orderId: 'order/1', title: 'Private name', body: 'private phone', notificationLogId: 'audit-1' } }) }, waitUntil: (p: Promise<void>) => { work = p; } });
  await work;
  expect(w.showNotification.mock.calls[0]).not.toContain('Private name');
  expect(JSON.stringify(w.showNotification.mock.calls)).not.toContain('private phone');
  expect(w.showNotification).toHaveBeenCalledWith('Samou Quick', expect.objectContaining({ tag: 'audit-1', data: { path: '/orders/order%2F1' } }));
});
it('never navigates to a supplied external URL on notification tap', async () => {
  const w = worker(); let work: Promise<void> | undefined;
  w.handlers.get('notificationclick')!({ notification: { close: vi.fn(), data: { path: 'https://attacker.example' } }, waitUntil: (p: Promise<void>) => { work = p; } });
  await work;
  expect(w.openWindow).toHaveBeenCalledWith('https://customer.example/home');
});
it('expired offers open the current home state instead of an actionable stale offer', async () => {
  const w = worker(); let work: Promise<void> | undefined;
  w.handlers.get('push')!({ data: { json: () => ({ data: { orderId: 'old', expiresAt: '1' } }) }, waitUntil: (p: Promise<void>) => { work = p; } });
  await work;
  expect(w.showNotification).toHaveBeenCalledWith('Samou Quick', expect.objectContaining({ data: { path: '/home' } }));
});
it.each(['https://customer.example/private/export', 'https://customer.example/uploads/private'])('does not cache arbitrary same-origin data: %s', url => {
  const w = worker(); const respondWith = vi.fn();
  w.handlers.get('fetch')!({ request: new Request(url), respondWith });
  expect(respondWith).not.toHaveBeenCalled();
});
it('does not cache requests carrying an Authorization header even under assets', () => {
  const w = worker(); const respondWith = vi.fn();
  w.handlers.get('fetch')!({ request: new Request('https://customer.example/assets/private.json', { headers: { Authorization: 'Bearer test' } }), respondWith });
  expect(respondWith).not.toHaveBeenCalled();
});
