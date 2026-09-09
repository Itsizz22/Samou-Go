import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { UserRole, type PublicUser } from '@samou-go/shared-types';
import { useAuth, useResource, listOrders, setToken, setRefreshToken, syncActiveSession, getToken, getRefreshToken, needsSessionRecovery, SessionRecovery } from '@samou-go/api-client';
import { AuthContext } from '../src/contexts/AuthContext';
import { useOrders } from '../src/hooks/useApi';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
  var sessionTestResult: { passed: string[]; error?: string } | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const passed: string[] = [];
const originalFetch = window.fetch.bind(window);
const requests: { url: string; authorization: string | null }[] = [];
const user: PublicUser = {
  id: 'browser-customer', name: 'Browser test', phone: '0599000001', role: UserRole.CUSTOMER,
  isActive: true, isVerified: true, isAvailable: false, assignedStoreId: null,
  latitude: null, longitude: null, profileImageUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const envelope = (data: unknown) => Response.json({ success: true, data });
let resolveMe: (response: Response) => void = () => { throw new Error('No pending profile request'); };
let denyOrders = false;
let networkFailure = false;

window.fetch = async (input, init) => {
  const url = String(input);
  if (!url.includes('/api/v1/')) return originalFetch(input, init);
  if (networkFailure) throw new TypeError('Failed to fetch');
  requests.push({ url, authorization: new Headers(init?.headers).get('Authorization') });
  if (url.endsWith('/auth/me')) return new Promise<Response>((resolve) => { resolveMe = resolve; });
  if (url.includes('/orders')) {
    return denyOrders
      ? Response.json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 })
      : envelope({ items: [], page: 1, pageSize: 50, total: 0, totalPages: 0 });
  }
  throw new Error(`Unexpected API request: ${url}`);
};

export function Recovery() {
  const auth = useAuth();
  return needsSessionRecovery(auth) ? <SessionRecovery auth={auth} /> : <span>{auth.user ? 'authenticated' : 'loading'}</span>;
}
export function Orders() {
  const orders = useOrders({ pageSize: 50 }, { pollMs: 20 });
  return <span>{orders.loading ? 'loading' : 'ready'}</span>;
}
export function App() {
  const auth = useAuth();
  return <AuthContext.Provider value={auth}><Orders /></AuthContext.Provider>;
}
export function Forbidden() {
  const resource = useResource('forbidden', (signal) => listOrders({}, signal), { pollMs: 20 });
  return <span>{resource.error?.status}</span>;
}
export function Scoped({ account }: { account: string }) {
  const resource = useResource(account, async () => account);
  return <span>{resource.data ?? 'loading'}</span>;
}

async function run() {
  localStorage.clear();
  sessionStorage.clear();
  setToken('browser-access');
  setRefreshToken('browser-refresh');
  syncActiveSession(user);
  const container = document.getElementById('root');
  if (!container) throw new Error('Missing test container');
  let root = createRoot(container);
  await act(async () => root.render(<App />));
  assert(requests.some((request) => request.url.endsWith('/auth/me')), 'Profile verification did not start');
  assert(!requests.some((request) => request.url.includes('/orders')), 'Orders fired before authentication hydration');
  passed.push('cached user does not enable orders before hydration');
  await act(async () => { resolveMe(envelope(user)); });
  assert(requests.some((request) => request.url.includes('/orders') && request.authorization === 'Bearer browser-access'), 'Verified orders did not carry the live access token');
  passed.push('verified session sends Bearer orders request');
  await act(async () => root.unmount());

  requests.length = 0;
  denyOrders = true;
  root = createRoot(container);
  await act(async () => root.render(<Forbidden />));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
  assert(requests.filter((request) => request.url.includes('/orders')).length === 1, '403 was repeatedly polled');
  assert(container.textContent === '403', 'Authorization error was hidden');
  passed.push('403 is surfaced and stops automatic polling');
  await act(async () => root.unmount());

  root = createRoot(container);
  await act(async () => root.render(<Scoped account="account-a" />));
  assert(container.textContent === 'account-a', 'Initial scoped data missing');
  await act(async () => root.render(<Scoped account="account-b" />));
  assert(container.textContent === 'account-b', 'Account switch retained previous scoped data');
  passed.push('resource data follows account scope');
  await act(async () => root.unmount());
  networkFailure = true;
  root = createRoot(container);
  await act(async () => root.render(<Recovery />));
  assert(container.textContent?.includes('تعذر الاتصال بالخادم'), 'Network error was treated as logout');
  assert(getToken() === 'browser-access' && getRefreshToken() === 'browser-refresh', 'Offline boot discarded credentials');
  networkFailure = false;
  await act(async () => { window.dispatchEvent(new Event('online')); });
  await act(async () => { resolveMe(envelope(user)); });
  assert(container.textContent === 'authenticated', 'Session did not recover on reconnect');
  passed.push('offline boot retains credentials and reconnect restores verified session');
  await act(async () => root.unmount());
  window.fetch = originalFetch;
  globalThis.sessionTestResult = { passed };
}
void run().catch((cause: unknown) => {
  window.fetch = originalFetch;
  globalThis.sessionTestResult = { passed, error: cause instanceof Error ? cause.message : String(cause) };
});
