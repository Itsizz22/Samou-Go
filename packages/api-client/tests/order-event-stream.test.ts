import { expect, it, vi } from 'vitest';
import { readOrderEvents } from '../src/order-event-stream';
it('uses bearer auth and refetches on named events split across network chunks', async () => {
  const text = new TextEncoder();
  const fetchMock = vi.fn(async () => new Response(new ReadableStream({ start(controller) {
    for (const part of ['event: connec', 'ted\r\ndata: {}\r\n\r\nevent: up', 'date\ndata: {}\n\n']) controller.enqueue(text.encode(part));
    controller.close();
  } })));
  vi.stubGlobal('fetch', fetchMock);
  const update = vi.fn(); const signal = new AbortController().signal;
  await readOrderEvents('https://api.example/orders/id/events', 'test-token', signal, update);
  expect(fetchMock).toHaveBeenCalledWith('https://api.example/orders/id/events', { headers: { Authorization: 'Bearer test-token' }, signal, cache: 'no-store' });
  expect(update).toHaveBeenCalledTimes(2);
  vi.unstubAllGlobals();
});
it('does not accept a rejected stream as an order update', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
  const update = vi.fn();
  await expect(readOrderEvents('/events', 'test', new AbortController().signal, update)).rejects.toThrow();
  expect(update).not.toHaveBeenCalled(); vi.unstubAllGlobals();
});
