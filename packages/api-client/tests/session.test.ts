import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

const user = { id: 'customer-a', phone: '0599000001', name: 'Test customer', role: 'CUSTOMER' };
const session = { user, accessToken: 'rotated-access', refreshToken: 'rotated-refresh' };
const page = { items: [], page: 1, pageSize: 50, total: 0, totalPages: 0 };
const success = (data: unknown) => Response.json({ success: true, data });
const failure = (status: number) => Response.json({ success: false, error: { code: `HTTP_${status}`, message: 'Request rejected' } }, { status });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

beforeEach(() => {
  vi.resetModules();
  const local = storage();
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', storage());
  vi.stubGlobal('window', { localStorage: local });
});
afterEach(() => vi.unstubAllGlobals());

async function signedIn() {
  const api = await import('../src/api');
  api.setToken('initial-access');
  api.setRefreshToken('initial-refresh');
  return api;
}

describe('authenticated orders transport', () => {
  it('attaches the live Bearer token and preserves pageSize=81', async () => {
    const api = await signedIn();
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(success(page));
    vi.stubGlobal('fetch', fetch);
    await api.listOrders({ pageSize: 81 });
    expect(fetch.mock.calls[0]?.[0]).toContain('/orders?pageSize=81');
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe('Bearer initial-access');
  });

  it('does not send an anonymous protected request', async () => {
    const api = await import('../src/api');
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', fetch);
    await expect(api.listOrders()).rejects.toMatchObject({ status: 401 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rotates an expired session once and retries with the new access token', async () => {
    const api = await signedIn();
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(failure(401)).mockResolvedValueOnce(success(session)).mockResolvedValueOnce(success(page));
    vi.stubGlobal('fetch', fetch);
    await expect(api.listOrders()).resolves.toEqual(page);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(new Headers(fetch.mock.calls[2]?.[1]?.headers).get('Authorization')).toBe('Bearer rotated-access');
    const vault = await import('../src/accountVault');
    expect(vault.getActiveAccount()).toMatchObject({ id: user.id, token: session.accessToken, refreshToken: session.refreshToken });
  });

  it('restores a refresh-only session before sending orders', async () => {
    const api = await signedIn();
    api.clearToken();
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(success(session)).mockResolvedValueOnce(success(page));
    vi.stubGlobal('fetch', fetch);
    await api.listOrders();
    expect(fetch.mock.calls[0]?.[0]).toContain('/auth/refresh');
    expect(fetch.mock.calls[1]?.[0]).toContain('/orders');
  });

  it('shares explicit boot refresh and request-triggered refresh', async () => {
    const api = await signedIn();
    const rotation = deferred<Response>();
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (url) => {
      if (String(url).endsWith('/auth/refresh')) return rotation.promise;
      return api.getToken() === 'initial-access' ? failure(401) : success(page);
    });
    vi.stubGlobal('fetch', fetch);
    const boot = api.refreshAccessToken('initial-refresh');
    const orders = api.listOrders();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    rotation.resolve(success(session));
    await Promise.all([boot, orders]);
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('clears both credentials on rejected refresh and stops retrying', async () => {
    const api = await signedIn();
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => failure(401));
    vi.stubGlobal('fetch', fetch);
    await expect(api.listOrders()).rejects.toMatchObject({ status: 401 });
    await expect(api.listOrders()).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(api.getToken()).toBeNull();
    expect(api.getRefreshToken()).toBeNull();
  });

  it('stops after the retried orders request also returns 401', async () => {
    const api = await signedIn();
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(failure(401)).mockResolvedValueOnce(success(session)).mockResolvedValueOnce(failure(401));
    vi.stubGlobal('fetch', fetch);
    await expect(api.listOrders()).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(api.getRefreshToken()).toBeNull();
  });

  it('surfaces refresh 503 without deleting credentials and allows later recovery', async () => {
    const api = await signedIn();
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(failure(401)).mockResolvedValueOnce(failure(503));
    vi.stubGlobal('fetch', fetch);
    await expect(api.listOrders()).rejects.toMatchObject({ status: 503 });
    expect(api.getRefreshToken()).toBe('initial-refresh');
    fetch.mockResolvedValueOnce(failure(401)).mockResolvedValueOnce(success(session)).mockResolvedValueOnce(success(page));
    await expect(api.listOrders()).resolves.toEqual(page);
  });

  it('does not refresh a 403 or clear the authenticated session', async () => {
    const api = await signedIn();
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(failure(403));
    vi.stubGlobal('fetch', fetch);
    await expect(api.listOrders()).rejects.toMatchObject({ status: 403 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(api.getToken()).toBe('initial-access');
  });

  it('does not overwrite an account selected during refresh', async () => {
    const api = await signedIn();
    const response = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>().mockReturnValue(response.promise));
    const refresh = api.refreshAccessToken('initial-refresh');
    api.setToken('account-b-access');
    api.setRefreshToken('account-b-refresh');
    response.resolve(success(session));
    await expect(refresh).rejects.toMatchObject({ code: 'ABORTED' });
    expect(api.getToken()).toBe('account-b-access');
  });

  it('does not clear a newer account when an old orders response is rejected', async () => {
    const api = await signedIn();
    const response = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>().mockReturnValue(response.promise));
    const orders = api.listOrders();
    api.setToken('account-b-access');
    api.setRefreshToken('account-b-refresh');
    response.resolve(failure(401));
    await expect(orders).rejects.toMatchObject({ code: 'ABORTED' });
    expect(api.getToken()).toBe('account-b-access');
  });

  it('clears logout locally immediately and preserves a subsequent login', async () => {
    const api = await signedIn();
    const response = deferred<Response>();
    const fetch = vi.fn<typeof globalThis.fetch>().mockReturnValue(response.promise);
    vi.stubGlobal('fetch', fetch);
    const logout = api.logout();
    expect(api.getToken()).toBeNull();
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({ refreshToken: 'initial-refresh' });
    api.setToken('account-b-access');
    api.setRefreshToken('account-b-refresh');
    response.resolve(success(null));
    await logout;
    expect(api.getToken()).toBe('account-b-access');
  });

  it('restores persisted credentials after module reload', async () => {
    await signedIn();
    vi.resetModules();
    const api = await import('../src/api');
    expect(api.getToken()).toBe('initial-access');
    expect(api.getRefreshToken()).toBe('initial-refresh');
  });

  it('does not carry an old account refresh token into an SSO hand-off', async () => {
    const api = await signedIn();
    const replaceState = vi.fn();
    vi.stubGlobal('window', {
      localStorage,
      location: { search: '?token=incoming-access&ref=sso', pathname: '/', hash: '' },
      history: { state: null, replaceState },
    });
    const sso = await import('../src/sso');
    expect(sso.consumeSsoToken()).toBe('incoming-access');
    expect(api.getToken()).toBe('incoming-access');
    expect(api.getRefreshToken()).toBeNull();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/');
  });

  it('prefers live credentials over an outdated saved active id', async () => {
    await signedIn();
    localStorage.setItem('samou_quick_active_account', 'old-account');
    localStorage.setItem('samou_quick_accounts', JSON.stringify([
      { id: 'old-account', phone: '1', name: 'Old', role: 'CUSTOMER', token: 'old' },
      { id: user.id, phone: '2', name: 'Current', role: 'CUSTOMER', token: 'initial-access' },
    ]));
    const vault = await import('../src/accountVault');
    expect(vault.getActiveAccount()?.id).toBe(user.id);
  });
});
