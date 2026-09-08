package com.samougo.customer;

import android.app.NotificationChannel;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "MainActivity";

    /** Standard order notifications (sound = device default). */
    private static final String CHANNEL_ORDERS = "samou-go-orders";

    /** High-priority order alarm — plays a looping ringtone even when the app is killed. */
    private static final String CHANNEL_ORDERS_HIGH = "orders_high_priority";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register local plugins before Capacitor creates its bridge.
        registerPlugin(StopAlarmPlugin.class);
        registerPlugin(SettingsPlugin.class);
        super.onCreate(savedInstanceState);
        createNotificationChannels();

        // Handle notification tap — start alarm service if it's an order notification
        handleNotificationIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // App was already running — handle the new notification
        handleNotificationIntent(intent);
    }

    /**
     * If the app was opened via a notification tap, check if it's an order
     * notification and start the alarm service (or stop it if the user is
     * now viewing the order).
     */
    private void handleNotificationIntent(Intent intent) {
        if (intent == null || intent.getExtras() == null) return;

        String orderId = intent.getStringExtra("orderId");
        if (orderId != null) {
            Log.i(TAG, "Notification tap with orderId: " + orderId);
            // App is now in foreground — stop any playing alarm
            OrderAlarmReceiver.stopAlarm(this);
        }
    }

    private void createNotificationChannels() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;

        // Default order channel — normal priority, default device sound.
        NotificationChannel ordersChannel = new NotificationChannel(
            CHANNEL_ORDERS,
            "Orders",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        ordersChannel.setDescription("New order notifications for stores and captains");
        nm.createNotificationChannel(ordersChannel);

        // High-priority order alarm — IMPORTANCE_HIGH means heads-up + lockscreen + vibration.
        // Custom sound: the looping order_alarm ringtone.
        Uri alarmUri = Uri.parse(
            "android.resource://" + getPackageName() + "/raw/order_alarm"
        );
        AudioAttributes audioAttr = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();

        NotificationChannel highChannel = new NotificationChannel(
            CHANNEL_ORDERS_HIGH,
            "Order Alerts",
            NotificationManager.IMPORTANCE_HIGH
        );
        highChannel.setDescription("High-priority order alerts with looping alarm ringtone");
        highChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        highChannel.enableVibration(true);
        highChannel.setVibrationPattern(new long[]{0, 300, 200, 300});
        highChannel.setSound(alarmUri, audioAttr);
        nm.createNotificationChannel(highChannel);

        // ── Two-channel strategy for FirebaseMessagingService ──────────────
        // Alert channel: HIGH importance, custom ringtone, used when
        // "الهاتف يرن عند وصول طلب" is ON.
        if (nm.getNotificationChannel(FirebaseMyMessagingService.CHANNEL_ALERT) == null) {
            NotificationChannel alertChannel = new NotificationChannel(
                FirebaseMyMessagingService.CHANNEL_ALERT,
                "طلبات جديدة",
                NotificationManager.IMPORTANCE_HIGH
            );
            alertChannel.setDescription("إشعارات الطلبات الجديدة مع صوت تنبيه");
            alertChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            alertChannel.enableVibration(true);
            alertChannel.setVibrationPattern(new long[]{0, 500, 250, 500, 250});
            alertChannel.setSound(alarmUri, audioAttr);
            nm.createNotificationChannel(alertChannel);
        }

        // Silent channel: HIGH importance, no sound, used when toggle is OFF.
        if (nm.getNotificationChannel(FirebaseMyMessagingService.CHANNEL_SILENT) == null) {
            NotificationChannel silentChannel = new NotificationChannel(
                FirebaseMyMessagingService.CHANNEL_SILENT,
                "طلبات جديدة (صامت)",
                NotificationManager.IMPORTANCE_HIGH
            );
            silentChannel.setDescription("إشعارات الطلبات الجديدة بدون صوت");
            silentChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(silentChannel);
        }
    }
}
