import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('../src/sso', () => ({ buildSsoUrl: (url: string) => url }));
import { appUrl } from '../src/roles';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('sibling app URLs', () => {
  it('routes deployed Vercel apps to their separate production origins', () => {
    vi.stubGlobal('window', { location: { hostname: 'samou-go-store-details.vercel.app' } });
    expect(appUrl('checkout')).toBe('https://samou-go-checkout.vercel.app');
    expect(appUrl('customer')).toBe('https://samou-go-customer.vercel.app');
  });
  it('uses sibling Vite ports locally', () => {
    vi.stubGlobal('window', { location: { hostname: 'localhost' } });
    expect(appUrl('order-tracking')).toBe('http://localhost:5176');
  });
  it('keeps configured origins and custom reverse proxies', () => {
    vi.stubGlobal('window', { location: { hostname: 'delivery.example' } });
    expect(appUrl('checkout')).toBe('/checkout');
    vi.stubEnv('VITE_CHECKOUT_URL', 'https://checkout.example/');
    expect(appUrl('checkout')).toBe('https://checkout.example');
  });
});
