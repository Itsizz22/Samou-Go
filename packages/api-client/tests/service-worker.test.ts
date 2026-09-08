import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

describe('customer service worker API boundaries', () => {
  it.each([
    'https://samou-go.onrender.com/api/v1/orders?pageSize=50',
    'https://customer.example/api/v1/orders?pageSize=8',
    'https://another-api.example/api/v1/orders',
  ])('leaves %s to the browser network stack', (url) => {
    let onFetch: ((event: { request: Request; respondWith: (response: unknown) => void }) => void) | undefined;
    runInNewContext(readFileSync(new URL('../../../themes/web-customer/public/service-worker.js', import.meta.url), 'utf8'), {
      URL, Response,
      self: {
        location: { origin: 'https://customer.example' },
        addEventListener: (name: string, listener: typeof onFetch) => {
          if (name === 'fetch') onFetch = listener;
        },
      },
    });
    const respondWith = vi.fn();
    expect(onFetch).toBeDefined();
    onFetch?.({ request: new Request(url), respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  });
});
