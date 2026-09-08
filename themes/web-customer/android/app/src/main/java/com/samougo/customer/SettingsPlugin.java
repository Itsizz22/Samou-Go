package com.samougo.customer;

import android.content.SharedPreferences;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor plugin that bridges SharedPreferences between the web app and
 * native Android code. Used to persist the "ring on new order" preference
 * so the native {@link FirebaseMyMessagingService} can read it when showing
 * notifications in the background/killed state.
 *
 * <p>SharedPreferences file: {@code samou_go_settings}</p>
 * <p>Key: {@code ring_on_new_order} (boolean, default {@code true})</p>
 *
 * <p>Usage from JS:</p>
 * <pre>
 *   import { registerPlugin } from '@capacitor/core';
 *   const Settings = registerPlugin&lt;SettingsPlugin&gt;('Settings');
 *   await Settings.setRingOnOrder({ enabled: true });
 *   const result = await Settings.getRingOnOrder();
 *   // result.enabled === true
 * </pre>
 */
@CapacitorPlugin(name = "Settings")
public class SettingsPlugin extends Plugin {

    private static final String TAG = "SettingsPlugin";

    private SharedPreferences getPrefs() {
        return getContext().getSharedPreferences(
            FirebaseMyMessagingService.PREFS_NAME,
            android.content.Context.MODE_PRIVATE
        );
    }

    /**
     * Get the "ring on new order" preference.
     * Returns { enabled: true/false }.
     */
    @PluginMethod
    public void getRingOnOrder(PluginCall call) {
        try {
            boolean enabled = getPrefs().getBoolean(
                FirebaseMyMessagingService.KEY_RING_ON_ORDER,
                true // Default: ON
            );
            JSObject result = new JSObject();
            result.put("enabled", enabled);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "getRingOnOrder failed", e);
            call.reject("Failed to read ring preference", e);
        }
    }

    /**
     * Set the "ring on new order" preference.
     * Accepts { enabled: boolean }.
     */
    @PluginMethod
    public void setRingOnOrder(PluginCall call) {
        try {
            Boolean enabled = call.getBoolean("enabled");
            if (enabled == null) {
                call.reject("Missing 'enabled' parameter");
                return;
            }
            getPrefs().edit()
                .putBoolean(FirebaseMyMessagingService.KEY_RING_ON_ORDER, enabled)
                .apply();
            Log.i(TAG, "ring_on_new_order set to: " + enabled);
            JSObject result = new JSObject();
            result.put("enabled", enabled);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "setRingOnOrder failed", e);
            call.reject("Failed to save ring preference", e);
        }
    }
}
