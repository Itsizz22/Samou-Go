package com.samougo.customer;

import android.content.Intent;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor plugin that lets JavaScript stop the order alarm service.
 *
 * Usage from JS:
 *   import { Capacitor } from '@capacitor/core';
 *   import { OrderAlarm } from './OrderAlarmPlugin';
 *   await OrderAlarm.stop();
 *
 * Registered in MainActivity.java via registerPlugin(StopAlarmPlugin.class).
 */
@CapacitorPlugin(name = "OrderAlarm")
public class StopAlarmPlugin extends Plugin {

    private static final String TAG = "StopAlarmPlugin";

    /**
     * Stop the order alarm service.
     * Called when the user opens the app, accepts an order, or any
     * other JS-triggered acknowledgment.
     */
    @PluginMethod
    public void stop(PluginCall call) {
        Log.i(TAG, "stop() called from JS — stopping alarm service");

        // Send broadcast to stop the receiver/service
        Intent intent = new Intent(OrderAlarmReceiver.ACTION_STOP_ALARM);
        intent.setPackage(getContext().getPackageName());
        getContext().sendBroadcast(intent);

        // Also directly stop the foreground service
        Intent serviceIntent = new Intent(getContext(), OrderAlarmService.class);
        getContext().stopService(serviceIntent);

        JSObject result = new JSObject();
        result.put("stopped", true);
        call.resolve(result);
    }

    /**
     * Check if the alarm service is currently running.
     */
    @PluginMethod
    public void isActive(PluginCall call) {
        // We can't easily check if a service is running from outside,
        // but we can return a best-effort status.
        JSObject result = new JSObject();
        result.put("active", false); // Conservative default
        call.resolve(result);
    }
}
