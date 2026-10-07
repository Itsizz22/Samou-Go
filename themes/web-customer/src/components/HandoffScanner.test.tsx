// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HandoffScanner } from '@samou-go/api-client';
const camera = vi.hoisted(() => ({ decode: vi.fn(), stop: vi.fn(), trackStop: vi.fn(), media: vi.fn() }));
vi.mock('@zxing/browser', () => ({ BrowserQRCodeReader: class { decodeFromStream = camera.decode; } }));
let root: Root;
let host: HTMLDivElement;
let result: (value: { getText: () => string }) => void;
const onScan = vi.fn(async () => undefined);
const token = 'SAMOU:1:pickup:order-1:proof';
async function flush() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); }
async function mount() { await act(async () => { root.render(createElement(HandoffScanner, { orderId: 'order-1', stage: 'pickup', onScan, onClose: vi.fn() })); }); await flush(); }
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: camera.media } });
  camera.media.mockResolvedValue({ getTracks: () => [{ stop: camera.trackStop }] });
  camera.decode.mockImplementation(async (_stream, _video, callback) => { result = callback; return { stop: camera.stop }; });
  onScan.mockResolvedValue(undefined);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
it('requests the rear camera without microphone and releases it on close', async () => {
  await mount(); expect(camera.media).toHaveBeenCalledExactlyOnceWith({ audio: false, video: { facingMode: { ideal: 'environment' } } });
  await act(async () => root.render(null)); expect(camera.trackStop).toHaveBeenCalled(); expect(camera.stop).toHaveBeenCalled();
});
it('shows a recoverable permission error and retries on demand', async () => {
  camera.media.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
  await mount(); expect(host.querySelector('[role="alert"]')?.textContent).toContain('اسمح بالوصول');
  const retry = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'إعادة المسح');
  await act(async () => retry?.click()); await flush(); expect(camera.media).toHaveBeenCalledTimes(2);
});
it('rejects wrong order and stage, consumes valid proof only once and stops camera before submission', async () => {
  await mount();
  await act(async () => { result({ getText: () => token.replace('order-1', 'order-2') }); result({ getText: () => token.replace('pickup', 'delivery') }); });
  expect(onScan).not.toHaveBeenCalled();
  onScan.mockImplementation(async () => { expect(camera.trackStop).toHaveBeenCalled(); });
  await act(async () => { result({ getText: () => token }); result({ getText: () => token }); });
  expect(onScan).toHaveBeenCalledExactlyOnceWith(token);
});
it('stops when backgrounded and ignores late decode callbacks', async () => {
  await mount(); Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); result({ getText: () => token }); });
  expect(camera.trackStop).toHaveBeenCalled(); expect(onScan).not.toHaveBeenCalled();
});
it('releases a stream whose permission grant arrives after the dialog closed', async () => {
  let grant!: (stream: { getTracks: () => { stop: typeof camera.trackStop }[] }) => void;
  camera.media.mockImplementationOnce(() => new Promise(resolve => { grant = resolve; }));
  await mount(); await act(async () => root.render(null));
  await act(async () => grant({ getTracks: () => [{ stop: camera.trackStop }] })); await flush();
  expect(camera.trackStop).toHaveBeenCalled(); expect(camera.decode).not.toHaveBeenCalled();
});
it('allows retry after the server rejects a scanned proof', async () => {
  onScan.mockRejectedValueOnce(new Error('expired proof')); await mount();
  await act(async () => result({ getText: () => token }));
  expect(host.querySelector('[role="alert"]')?.textContent).toBe('expired proof');
  expect(Array.from(host.querySelectorAll('button')).some(button => button.textContent === 'إعادة المسح' && !button.disabled)).toBe(true);
});
