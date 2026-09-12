import { afterEach, expect, it, vi } from 'vitest';
import { startForegroundPolling } from './foreground-polling';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('pauses while hidden, refreshes on return, and cleans up', () => {
  vi.useFakeTimers();
  const doc = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal('document', doc);
  const reload = vi.fn();
  const stop = startForegroundPolling(reload, 1000);
  vi.advanceTimersByTime(2000); expect(reload).toHaveBeenCalledTimes(2);
  doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
  vi.advanceTimersByTime(10000); expect(reload).toHaveBeenCalledTimes(2);
  doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange'));
  expect(reload).toHaveBeenCalledTimes(3);
  vi.advanceTimersByTime(1000); expect(reload).toHaveBeenCalledTimes(4);
  stop(); doc.dispatchEvent(new Event('visibilitychange'));
  vi.advanceTimersByTime(5000); expect(reload).toHaveBeenCalledTimes(4);
});
it('does not start a timer for an initially hidden page', () => {
  vi.useFakeTimers(); vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: true }));
  const reload = vi.fn(); const stop = startForegroundPolling(reload, 1000);
  vi.advanceTimersByTime(5000); expect(reload).not.toHaveBeenCalled(); stop();
});
