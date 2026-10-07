import { beforeEach, expect, it, vi } from 'vitest';
beforeEach(() => vi.resetModules());
it('retains the latest cold-start destination and delivers it once when the router mounts', async () => {
  const navigation = await import('./globalNavigate');
  expect(navigation.globalNavigate('/orders/old')).toBe(false);
  expect(navigation.globalNavigate('/orders/current', { replace: true })).toBe(false);
  const navigate = vi.fn();
  navigation.setGlobalNavigate(navigate);
  expect(navigate).toHaveBeenCalledExactlyOnceWith('/orders/current', { replace: true });
  navigation.setGlobalNavigate(navigate);
  expect(navigate).toHaveBeenCalledTimes(1);
  navigation.globalNavigate('/captain/dashboard');
  expect(navigate).toHaveBeenLastCalledWith('/captain/dashboard', undefined);
});
