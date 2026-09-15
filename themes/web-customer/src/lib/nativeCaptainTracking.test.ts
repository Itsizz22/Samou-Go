import { beforeEach, expect, it, vi } from 'vitest';
import type { BackgroundGeolocationPlugin, Location } from '@capacitor-community/background-geolocation';
const state = vi.hoisted(() => ({ token: 'captain-token', start: vi.fn(), add: vi.fn(), remove: vi.fn(async () => {}), request: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true }, CapacitorHttp: { request: state.request }, registerPlugin: () => ({ addWatcher: state.add, removeWatcher: state.remove }) }));
vi.mock('@samou-go/api-client', () => ({ API_URL: 'https://api.example.test', getToken: () => state.token, setNativeCaptainTracker: state.start }));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); state.token = 'captain-token'; state.add.mockResolvedValue('watcher'); state.request.mockResolvedValue({ status: 200 }); });
const position = (): Location => ({ latitude: 31.4, longitude: 35, accuracy: 10, time: Date.now(), bearing: null, speed: null, altitude: null, altitudeAccuracy: null, simulated: false });
async function start() {
  await import('./nativeCaptainTracking');
  const activate = state.start.mock.calls[0]![0] as (id: string, callback: (message: string) => void) => () => void;
  const stop = activate('order', vi.fn());
  const callback = state.add.mock.calls[0]![1] as Parameters<BackgroundGeolocationPlugin['addWatcher']>[1];
  await Promise.resolve();
  return { stop, callback };
}
it('uses native HTTP for fresh samples and stops the native watcher on cleanup', async () => {
  const { stop, callback } = await start(); callback(position());
  expect(state.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'PUT', headers: expect.objectContaining({ Authorization: 'Bearer captain-token' }), data: expect.objectContaining({ orderId: 'order' }) }));
  stop(); expect(state.remove).toHaveBeenCalledWith({ id: 'watcher' });
});
it('never replays stale samples or uploads after account change', async () => {
  const { callback } = await start();
  callback({ ...position(), time: Date.now() - 120000 });
  state.token = 'other-account'; callback(position());
  expect(state.request).not.toHaveBeenCalled(); expect(state.remove).toHaveBeenCalled();
});
it('throttles attempts even when the network fails', async () => {
  state.request.mockRejectedValue(new Error('offline'));
  const { callback } = await start(); callback(position());
  await Promise.resolve(); await Promise.resolve(); callback(position());
  expect(state.request).toHaveBeenCalledTimes(1);
});
it('stops when the backend says the order or session no longer permits tracking', async () => {
  state.request.mockResolvedValue({ status: 403 });
  const { callback } = await start(); callback(position());
  await Promise.resolve(); expect(state.remove).toHaveBeenCalledWith({ id: 'watcher' });
});

it('rejects malformed coordinates and negative accuracy', async () => {
  const { callback } = await start();
  callback({ ...position(), latitude: NaN }); callback({ ...position(), longitude: 181 }); callback({ ...position(), accuracy: -1 });
  expect(state.request).not.toHaveBeenCalled();
});
it('coalesces identical samples but sends a stationary freshness heartbeat', async () => {
  const clock = vi.spyOn(Date, 'now'); const now = Date.now(); clock.mockReturnValue(now);
  try {
    const { callback } = await start(); callback(position());
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    clock.mockReturnValue(now + 11000); callback(position()); expect(state.request).toHaveBeenCalledTimes(1);
    clock.mockReturnValue(now + 31000); callback(position()); expect(state.request).toHaveBeenCalledTimes(2);
  } finally { clock.mockRestore(); }
});
