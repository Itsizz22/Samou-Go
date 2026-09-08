import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.resetModules(); });
function setup() {
  const listeners = new Map<string, () => void>();
  const ctx = {
    state: 'running', currentTime: 0, destination: {}, resume: vi.fn(async () => {}),
    createOscillator: () => ({ type: '', frequency: { value: 0 }, connect() {}, start() {}, stop() {} }),
    createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }),
  };
  const construct = vi.fn();
  class AudioContext { constructor() { construct(); return ctx; } }
  vi.stubGlobal('window', { AudioContext, addEventListener: (name: string, callback: () => void) => listeners.set(name, callback), removeEventListener: (name: string) => listeners.delete(name) });
  vi.stubGlobal('navigator', { userActivation: { hasBeenActive: false } });
  return { listeners, construct, ctx };
}
it('does not create audio before a gesture; creates it after activation', async () => {
  const { listeners, construct } = setup();
  const { playNewOrderChime } = await import('../../ui/src/chime');
  playNewOrderChime(); playNewOrderChime();
  expect(construct).not.toHaveBeenCalled();
  listeners.get('click')?.();
  playNewOrderChime();
  expect(construct).toHaveBeenCalledTimes(1);
});
it('stops finite loops by wall-clock time even if the audio clock stops', async () => {
  vi.useFakeTimers();
  setup();
  vi.stubGlobal('navigator', { userActivation: { hasBeenActive: true } });
  const { createLoopingAlert } = await import('../../ui/src/chime');
  createLoopingAlert(1200);
  vi.advanceTimersByTime(2400);
  expect(vi.getTimerCount()).toBe(0);
});
