/**
 * Order alarm bridge — stops the native foreground alarm service
 * when the store manager accepts an order.
 *
 * Only works on Android native (Capacitor). No-op on web/iOS.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

interface OrderAlarmPlugin {
  stop(): Promise<{ stopped: boolean }>;
  isActive(): Promise<{ active: boolean }>;
}

let plugin: OrderAlarmPlugin | null = null;

function getPlugin(): OrderAlarmPlugin | null {
  if (!Capacitor.isNativePlatform()) return null;
  if (!plugin) {
    try {
      plugin = registerPlugin<OrderAlarmPlugin>('OrderAlarm');
    } catch {
      return null;
    }
  }
  return plugin;
}

export async function stopOrderAlarm(): Promise<void> {
  const p = getPlugin();
  if (!p) return;
  try { await p.stop(); } catch { /* best-effort */ }
}
