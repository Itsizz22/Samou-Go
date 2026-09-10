import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ platform: 'web', enabled: true, chime: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => mocks.platform, isNativePlatform: () => mocks.platform !== 'web' }, registerPlugin: vi.fn() }));
vi.mock('@samou-go/ui', () => ({ playNewOrderChime: mocks.chime }));
vi.mock('./ringPreference', () => ({ getRingOnOrder: async () => mocks.enabled }));
import { announceOrderOnce } from './orderAlarm';
beforeEach(() => { vi.clearAllMocks(); mocks.platform = 'web'; mocks.enabled = true; vi.stubGlobal('document', { visibilityState: 'visible' }); });
it('plays a single web chime without scheduling a repeating timer', async () => {
  const timer = vi.spyOn(globalThis, 'setInterval');
  announceOrderOnce(); await Promise.resolve();
  expect(mocks.chime).toHaveBeenCalledTimes(1); expect(timer).not.toHaveBeenCalled(); timer.mockRestore();
});
it('leaves Android sound to native push, avoiding a second polling sound', async () => {
  mocks.platform = 'android'; announceOrderOnce(); await Promise.resolve(); expect(mocks.chime).not.toHaveBeenCalled();
});
it('honors mute and hidden pages', async () => {
  mocks.enabled = false; announceOrderOnce(); await Promise.resolve();
  mocks.enabled = true; vi.stubGlobal('document', { visibilityState: 'hidden' }); announceOrderOnce(); await Promise.resolve();
  expect(mocks.chime).not.toHaveBeenCalled();
});
it('cancels a pending sound when the order is acknowledged', async () => {
  const cancel = announceOrderOnce(); cancel(); await Promise.resolve(); expect(mocks.chime).not.toHaveBeenCalled();
});
