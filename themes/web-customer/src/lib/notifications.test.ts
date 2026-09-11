import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  token: 'account-a', permission: 'granted', platform: 'android',
  listeners: new Map<string, (value: never) => unknown>(),
  register: vi.fn(), request: vi.fn(), fetch: vi.fn(), navigate: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => mocks.platform } }));
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: {
  addListener: vi.fn(async (name: string, callback: (value: never) => unknown) => {
    mocks.listeners.set(name, callback); return { remove: vi.fn() };
  }),
  checkPermissions: async () => ({ receive: mocks.permission }),
  requestPermissions: mocks.request, register: mocks.register,
} }));
vi.mock('@capacitor/app', () => ({ App: { addListener: async () => ({ remove: vi.fn() }) } }));
vi.mock('@samou-go/api-client', () => ({ API_URL: 'https://api.example.test', getToken: () => mocks.token, setLogoutDeviceToken: vi.fn() }));
vi.mock('@samou-go/ui', () => ({ createLoopingAlert: vi.fn() }));
vi.mock('./globalNavigate', () => ({ globalNavigate: mocks.navigate }));
vi.mock('./orderAlarm', () => ({ stopOrderAlarm: async () => {} }));
vi.mock('./ringPreference', () => ({ getRingOnOrder: async () => false }));

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); mocks.listeners.clear();
  mocks.token = 'account-a'; mocks.permission = 'granted'; mocks.platform = 'android';
  mocks.fetch.mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal('fetch', mocks.fetch);
  vi.stubGlobal('window', { addEventListener: vi.fn(), setTimeout, clearTimeout });
  vi.stubGlobal('navigator', { userAgent: 'Android QA' });
});

it('synchronizes the cached device with a new account without duplicating listeners', async () => {
  const { registerForPushNotifications } = await import('./notifications');
  await registerForPushNotifications('account-a');
  const callback = mocks.listeners.get('registration');
  // The plugin owns the untyped event boundary in this mock.
  Reflect.apply(callback!, null, [{ value: 'device-token' }]);
  await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
  mocks.token = 'account-b';
  await registerForPushNotifications('account-b');
  expect(mocks.fetch.mock.calls[1]?.[1].headers.Authorization).toBe('Bearer account-b');
  expect(mocks.register).toHaveBeenCalledTimes(1);
  expect(mocks.listeners.size).toBe(3);
});

it('does not prompt repeatedly when denied and still receives notification tap events', async () => {
  mocks.permission = 'denied';
  const { registerForPushNotifications } = await import('./notifications');
  await registerForPushNotifications('account-a');
  await registerForPushNotifications('account-a');
  expect(mocks.request).not.toHaveBeenCalled();
  expect(mocks.register).not.toHaveBeenCalled();
  Reflect.apply(mocks.listeners.get('pushNotificationActionPerformed')!, null, [{ notification: { data: { orderId: 'order/123' } } }]);
  expect(mocks.navigate).toHaveBeenCalledWith('/orders/order%2F123');
});

it('uses the current account when a delayed token event arrives after switching accounts', async () => {
  const { registerForPushNotifications } = await import('./notifications');
  await registerForPushNotifications('account-a');
  mocks.token = 'account-b';
  Reflect.apply(mocks.listeners.get('registration')!, null, [{ value: 'device-token' }]);
  await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
  expect(mocks.fetch.mock.calls[0]?.[1].headers.Authorization).toBe('Bearer account-b');
});

it('iOS dismissal never opens an order, and taps open the incoming-order screen', async () => {
  mocks.platform = 'ios';
  const { registerForPushNotifications } = await import('./notifications');
  await registerForPushNotifications('account-a');
  const action = mocks.listeners.get('pushNotificationActionPerformed')!;
  const notification = { title: 'طلب جديد', body: 'متجر الاختبار', data: { type: 'NEW_ORDER_ALERT', orderId: 'order' } };
  Reflect.apply(action, null, [{ actionId: 'SAMOU_DISMISS', notification }]);
  expect(mocks.navigate).not.toHaveBeenCalled();
  Reflect.apply(action, null, [{ actionId: 'SAMOU_VIEW_ORDER', notification }]);
  expect(mocks.navigate).not.toHaveBeenCalled();
  const incoming = await import('./incomingOrder');
  expect(incoming.getIncomingOrder()).toEqual({ orderId: 'order', title: 'طلب جديد', body: 'متجر الاختبار' });
  Reflect.apply(action, null, [{ actionId: 'SAMOU_DISMISS', notification }]);
  expect(incoming.getIncomingOrder()).toBeNull();
  expect(incoming.presentIncomingOrder({ data: { type: 'ORDER_STATUS', orderId: 'order' } })).toBe(false);
  expect(incoming.presentIncomingOrder({ data: { type: 'NEW_ORDER_ALERT' } })).toBe(false);
});
it('routes pharmacy quote notifications to the correct audience', async () => {
  const { registerForPushNotifications } = await import('./notifications');
  await registerForPushNotifications('account-a');
  const action = mocks.listeners.get('pushNotificationActionPerformed')!;
  Reflect.apply(action, null, [{ notification: { data: { screen: 'custom-requests', customRequestId: 'rx', audience: 'customer' } } }]);
  expect(mocks.navigate).toHaveBeenLastCalledWith('/custom-requests');
  Reflect.apply(action, null, [{ notification: { data: { screen: 'custom-requests', customRequestId: 'rx', audience: 'store', storeId: 'pharmacy' } } }]);
  expect(mocks.navigate).toHaveBeenLastCalledWith('/store-manager/orders?tab=custom-requests&storeId=pharmacy');
});
