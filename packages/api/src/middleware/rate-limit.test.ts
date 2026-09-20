import express from 'express';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { UserRole } from '@samou-go/shared-types';
vi.mock('../config/env', () => ({ env: { isTest: false, isDevelopment: false } }));
vi.mock('../lib/pilot-telemetry', () => ({ recordPilotEvent: vi.fn() }));
import { authLimiter, orderLimiter, quoteLimiter, refreshLimiter } from './rate-limit';
let server: Server;
let base: string;
beforeAll(async () => {
  const app = express();
  // Test-only authenticated identity; production authentication verifies JWTs.
  app.use((req, _res, next) => {
    const id = req.get('x-test-user');
    if (id) req.auth = { sub: id, role: UserRole.CUSTOMER, phone: "0599000000" };
    next();
  });
  app.post('/login', authLimiter, (_req, res) => { res.sendStatus(204); });
  app.post('/refresh', refreshLimiter, (_req, res) => { res.sendStatus(204); });
  app.post('/order', orderLimiter, (_req, res) => { res.sendStatus(204); });
  app.post('/quote', quoteLimiter, (_req, res) => { res.sendStatus(204); });
  server = await new Promise<Server>(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing address');
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(() => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }));
async function send(route: string, user?: string) {
  const response = await fetch(base + route, { method: 'POST', headers: user ? { 'x-test-user': user } : {} });
  await response.text();
  return response;
}
describe('production rate limits on shared networks', () => {
  it('does not spend login attempts when renewing sessions, but still limits login', async () => {
    for (let i = 0; i < 15; i++) expect((await send('/refresh')).status).toBe(204);
    for (let i = 0; i < 10; i++) expect((await send('/login')).status).toBe(204);
    expect((await send('/login')).status).toBe(429);
    expect((await send('/refresh')).status).toBe(204);
  });
  it('isolates customer quotas while preserving abuse limits', async () => {
    for (let i = 0; i < 5; i++) expect((await send('/order', 'customer-a')).status).toBe(204);
    const blocked = await send('/order', 'customer-a');
    expect(blocked.status).toBe(429);
    expect(blocked.headers.has('retry-after')).toBe(true);
    expect((await send('/order', 'customer-b')).status).toBe(204);
  });
  it('separates authenticated quotes from anonymous IP quotas', async () => {
    for (let i = 0; i < 30; i++) expect((await send('/quote')).status).toBe(204);
    expect((await send('/quote')).status).toBe(429);
    expect((await send('/quote', 'customer-c')).status).toBe(204);
  });
});
