package com.samougo.customer;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * BroadcastReceiver that starts the {@link OrderAlarmService} when an order
 * push notification arrives while the app is killed/backgrounded.
 *
 * Registered in AndroidManifest.xml for the custom action "ORDER_ALARM_START".
 * The Capacitor PushNotifications plugin delivers the FCM message; this
 * receiver intercepts it and starts the looping alarm service.
 *
 * Alternatively, the service can be started directly by the
 * {@link OrderAlarmReceiver#processNotification} method from a
 * FirebaseMessagingService if one is added later.
 */
public class OrderAlarmReceiver extends BroadcastReceiver {

    private static final String TAG = "OrderAlarmReceiver";
    public static final String ACTION_START_ALARM = "com.samougo.customer.ORDER_ALARM_START";
    public static final String ACTION_STOP_ALARM = "com.samougo.customer.ORDER_ALARM_STOP";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;

        String action = intent.getAction();
        Log.i(TAG, "Received action: " + action);

        switch (action) {
            case ACTION_START_ALARM:
                startAlarmService(context, intent);
                break;
            case ACTION_STOP_ALARM:
                stopAlarmService(context);
                if (intent.hasExtra("notificationId")) {
                    NotificationManager manager = context.getSystemService(NotificationManager.class);
                    if (manager != null) manager.cancel(intent.getIntExtra("notificationId", 0));
                }
                break;
            default:
                Log.w(TAG, "Unknown action: " + action);
        }
    }

    /** Start the foreground alarm service. */
    private void startAlarmService(Context context, Intent originalIntent) {
        Intent serviceIntent = new Intent(context, OrderAlarmService.class);

        // Copy any extra data from the original intent (orderId, etc.)
        if (originalIntent.getExtras() != null) {
            serviceIntent.putExtras(originalIntent.getExtras());
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
        } catch (IllegalStateException | SecurityException error) {
            // Android may downgrade FCM priority or deny a background service.
            // The already posted notification remains available to the user.
            Log.w(TAG, "Background alarm unavailable; retaining notification", error);
        }

        Log.i(TAG, "OrderAlarmService started");
    }

    /** Stop the foreground alarm service. */
    private void stopAlarmService(Context context) {
        Intent serviceIntent = new Intent(context, OrderAlarmService.class);
        context.stopService(serviceIntent);
        Log.i(TAG, "OrderAlarmService stopped");
    }

    /**
     * Static helper — can be called from MainActivity or a future
     * FirebaseMessagingService to process an incoming notification.
     */
    public static void processNotification(Context context, String orderId, String title, String body) {
        Intent intent = new Intent(ACTION_START_ALARM);
        intent.putExtra("title", title);
        intent.putExtra("body", body);
        intent.setPackage(context.getPackageName());
        if (orderId != null) {
            intent.putExtra("orderId", orderId);
        }
        context.sendBroadcast(intent);
    }

    /** Static helper to stop the alarm from anywhere in the app. */
    public static void stopAlarm(Context context) {
        Intent intent = new Intent(ACTION_STOP_ALARM);
        intent.setPackage(context.getPackageName());
        context.sendBroadcast(intent);
    }
}
