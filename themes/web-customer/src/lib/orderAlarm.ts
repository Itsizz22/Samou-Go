/**
 * Order alarm bridge — stops the native foreground alarm service
 * when the user opens the app or accepts an order.
 *
 * Only works on Android native (Capacitor). No-op on web/iOS.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

/** Capacitor plugin interface for the native OrderAlarm service. */
interface OrderAlarmPlugin {
  stop(): Promise<{ stopped: boolean }>;
  isActive(): Promise<{ active: boolean }>;
}

/** Registered plugin instance (lazy). */
let plugin: OrderAlarmPlugin | null = null;

function getPlugin(): OrderAlarmPlugin | null {
  if (!Capacitor.isNativePlatform()) return null;
  if (!plugin) {
    try {
      plugin = registerPlugin<OrderAlarmPlugin>('OrderAlarm');
    } catch {
      // Plugin not available (web, iOS, or old build) — silent no-op.
      return null;
    }
  }
  return plugin;
}

/**
 * Stop the native alarm service.
 * Safe to call from anywhere — no-ops on web/iOS or if the service isn't running.
 */
export async function stopOrderAlarm(): Promise<void> {
  const p = getPlugin();
  if (!p) return;
  try {
    await p.stop();
  } catch {
    // Best-effort — don't crash if the service isn't running.
  }
}

/**
 * Check if the native alarm service is active.
 * Returns false on web/iOS or if unavailable.
 */
export async function isOrderAlarmActive(): Promise<boolean> {
  const p = getPlugin();
  if (!p) return false;
  try {
    const result = await p.isActive();
    return result.active;
  } catch {
    return false;
  }
}
