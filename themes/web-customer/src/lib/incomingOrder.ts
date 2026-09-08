import { useSyncExternalStore } from 'react';
export interface IncomingOrder { orderId: string; title: string; body: string }
let current: IncomingOrder | null = null;
const listeners = new Set<() => void>();
export function presentIncomingOrder(notification: { title?: string; body?: string; data?: Record<string, unknown> }): boolean {
  const data = notification.data;
  if (!data || !['NEW_ORDER', 'NEW_ORDER_ALERT', 'CAPTAIN_ASSIGN'].includes(String(data.type)) || typeof data.orderId !== 'string' || !data.orderId.trim()) return false;
  current = { orderId: data.orderId, title: notification.title || 'طلب جديد', body: notification.body || 'افتح الطلب لمراجعة التفاصيل.' };
  listeners.forEach(listener => listener());
  return true;
}
export function dismissIncomingOrder(): void { current = null; listeners.forEach(listener => listener()); }
export function getIncomingOrder(): IncomingOrder | null { return current; }
export function useIncomingOrder(): IncomingOrder | null {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, getIncomingOrder, () => null);
}
