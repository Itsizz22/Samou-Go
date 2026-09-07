/**
 * Ring-on-order preference — bridges the "الهاتف يرن عند وصول طلب" setting
 * between the web app (localStorage) and native Android (SharedPreferences via
 * the SettingsPlugin Capacitor plugin).
 *
 * On native (Android), the value is persisted in SharedPreferences so the
 * native FirebaseMyMessagingService can read it when building notifications
 * for the correct channel (alert vs. silent) even when the app is killed.
 *
 * On web, the value lives in localStorage (no native bridge needed).
 *
 * Default: true (ring is ON).
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

const STORAGE_KEY = 'samou.settings.ringOnOrder';

/** Capacitor plugin interface matching SettingsPlugin.java. */
interface SettingsPluginType {
  getRingOnOrder(): Promise<{ enabled: boolean }>;
  setRingOnOrder(options: { enabled: boolean }): Promise<{ enabled: boolean }>;
}

/** Lazy plugin instance. */
let plugin: SettingsPluginType | null = null;

function getPlugin(): SettingsPluginType | null {
  if (!Capacitor.isNativePlatform()) return null;
  if (!plugin) {
    try {
      plugin = registerPlugin<SettingsPluginType>('Settings');
    } catch {
      return null;
    }
  }
  return plugin;
}

/**
 * Read the ring-on-order preference.
 * Uses SharedPreferences on Android, localStorage on web.
 */
export async function getRingOnOrder(): Promise<boolean> {
  const nativePlugin = getPlugin();
  if (nativePlugin) {
    try {
      const result = await nativePlugin.getRingOnOrder();
      return result.enabled;
    } catch {
      // Fallback to localStorage if native fails
    }
  }
  // Web / fallback
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === '1' || stored === 'true';
  } catch {
    /* Private mode — use default. */
  }
  return true; // Default: ON
}

/**
 * Write the ring-on-order preference.
 * Persists to both SharedPreferences (Android) and localStorage (web fallback).
 */
export async function setRingOnOrder(enabled: boolean): Promise<void> {
  // Persist to localStorage (always, for web fallback)
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* Private mode — best-effort. */
  }
  // Persist to SharedPreferences on Android
  const nativePlugin = getPlugin();
  if (nativePlugin) {
    try {
      await nativePlugin.setRingOnOrder({ enabled });
    } catch {
      // Best-effort — localStorage is the fallback.
    }
  }
}
