package com.samougo.customer;

import android.app.NotificationManager;
import android.app.NotificationChannel;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Firebase Cloud Messaging service that handles incoming push notifications
 * when the app is in the foreground, background, or completely killed.
 *
 * <p>For data-only messages (no {@code notification} key in the payload),
 * Android always routes through {@code onMessageReceived()}, even when the
 * app is killed. This service then builds a custom notification on the
 * appropriate channel based on the driver's "ring on new order" preference.</p>
 *
 * <p>Two-channel strategy (Android notification channels are immutable once
 * created):</p>
 * <ul>
 *   <li>{@code orders_alert_channel} — HIGH importance, custom ringtone,
 *       vibration, used when "الهاتف يرن عند وصول طلب" is ON.</li>
 *   <li>{@code orders_silent_channel} — HIGH importance, no sound, used
 *       when the toggle is OFF.</li>
 * </ul>
 *
 * <p>Tapping the notification deep-links directly to the Order Details
 * screen via the SPA router ({@code /orders/:orderId}).</p>
 */
public class FirebaseMyMessagingService extends FirebaseMessagingService {

    private static final String TAG = "FirebaseMessaging";

    /** Channel for ringing notifications (ringtone + vibration). */
    public static final String CHANNEL_ALERT = "orders_alert_channel";
    /** Channel for silent notifications (no sound). */
    public static final String CHANNEL_SILENT = "orders_silent_channel";

    /** SharedPreferences file used by both this service and the SettingsPlugin. */
    public static final String PREFS_NAME = "samou_go_settings";
    /** Key for the "ring on new order" boolean preference. */
    public static final String KEY_RING_ON_ORDER = "ring_on_new_order";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Log.i(TAG, "onMessageReceived — from: " + remoteMessage.getFrom());

        // Only process data messages — the Capacitor PushNotifications plugin
        // handles standard notification messages in the foreground via its own
        // listener in notifications.ts. If we processed both, the user would
        // see duplicate notifications in the foreground.
        Map<String, String> data = remoteMessage.getData();
        if (data.isEmpty()) {
            Log.d(TAG, "No data payload — ignoring (handled by Capacitor)");
            return;
        }

        // Extract fields from the data payload
        String orderId = data.get("orderId");
        String type = data.get("type");
        String title = data.get("title");
        String body = data.get("body");

        if (title == null || body == null) {
            Log.w(TAG, "Missing title or body in data payload — ignoring");
            return;
        }

        // Filter: only show native notification for NEW_ORDER and status updates
        // targeting store managers and captains. Customer-facing status updates
        // (ACCEPTED, PREPARING, ON_THE_WAY, DELIVERED) are handled by the
        // Capacitor PushNotifications listener when the app is in foreground,
        // and by the system notification channel when in background/killed.
        boolean isCaptainOrStoreNotification =
            "NEW_ORDER".equals(type) ||
            "CAPTAIN_ASSIGN".equals(type);

        // For non-captain/store notifications that arrive as data-only, let the
        // system handle them (they come with a notification payload from the
        // backend's standard sendPushToUser for customer-facing updates).
        if (!isCaptainOrStoreNotification) {
            Log.d(TAG, "Non-captain/store notification type '" + type + "' — ignoring (system handles)");
            return;
        }

        // Check the user's "ring on new order" preference
        boolean ringEnabled = getRingPreference();

        // Determine which notification channel to use
        String channelId = ringEnabled ? CHANNEL_ALERT : CHANNEL_SILENT;
        Log.i(TAG, "Showing notification on channel: " + channelId +
              " (ring preference: " + ringEnabled + ")");

        // Build and show the notification
        showNotification(title, body, orderId, channelId);

        // If ringing is enabled, start the OrderAlarmService for continuous alert
        // (the system notification plays the channel sound once, but the foreground
        // service loops it until the user acknowledges).
        if (ringEnabled && orderId != null) {
            OrderAlarmReceiver.processNotification(this, orderId);
        }
    }

    @Override
    public void onNewToken(@NonNull String token) {
        Log.i(TAG, "FCM token refreshed: " + token);
        // The Capacitor PushNotifications plugin handles token refresh
        // and re-registration with the backend via its own listeners
        // in notifications.ts. No additional work needed here.
    }

    /**
     * Read the "ring on new order" preference from SharedPreferences.
     * Defaults to {@code true} (ON) for first-time users.
     */
    private boolean getRingPreference() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        return prefs.getBoolean(KEY_RING_ON_ORDER, true);
    }

    /**
     * Build and display a notification on the specified channel.
     * Uses {@code orderId.hashCode()} as the notification ID so multiple
     * concurrent orders produce distinct notifications.
     */
    private void showNotification(String title, String body, String orderId, String channelId) {
        Context context = getApplicationContext();

        // Create channels if they don't exist yet (idempotent)
        ensureChannelsExist(context);

        // Build the deep-link intent: opens the app and navigates to
        // /orders/:orderId via the SPA router.
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (orderId != null) {
            intent.putExtra("orderId", orderId);
            intent.putExtra("clickAction", "OPEN_ORDER");
        }

        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            orderId != null ? orderId.hashCode() : 0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Derive a stable notification ID from the orderId so multiple
        // incoming orders produce distinct notifications.
        int notificationId = orderId != null ? orderId.hashCode() : (int) (System.currentTimeMillis() % Integer.MAX_VALUE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setDefaults(NotificationCompat.DEFAULT_VIBRATE);

        // Set sound only for the alert channel
        if (CHANNEL_ALERT.equals(channelId)) {
            Uri alarmUri = Uri.parse("android.resource://" + getPackageName() + "/raw/order_alarm");
            builder.setSound(alarmUri, AudioManager.STREAM_ALARM);
            // FLAG_INSISTENT makes the sound repeat continuously until
            // the driver taps the notification or dismisses it.
            // Note: this is set on the notification channel, not the builder,
            // since Android 8+ plays sound from the channel config.
        }
        // Silent channel: no sound set → notification is silent

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(notificationId, builder.build());
        }
    }

    /**
     * Ensure both notification channels exist. Called on every notification
     * but only creates channels if they don't already exist (idempotent).
     *
     * Android notification channels are IMMUTABLE once created — if a channel
     * already exists, these calls are no-ops. To change channel properties,
     * the user must uninstall/reinstall the app or clear app data.
     */
    private void ensureChannelsExist(Context context) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        // Alert channel: HIGH importance, custom ringtone, vibration
        if (nm.getNotificationChannel(CHANNEL_ALERT) == null) {
            Uri alarmUri = Uri.parse("android.resource://" + context.getPackageName() + "/raw/order_alarm");
            AudioAttributes audioAttr = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();

            NotificationChannel alertChannel = new NotificationChannel(
                CHANNEL_ALERT,
                "طلبات جديدة",
                NotificationManager.IMPORTANCE_HIGH
            );
            alertChannel.setDescription("إشعارات الطلبات الجديدة مع صوت تنبيه");
            alertChannel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            alertChannel.enableVibration(true);
            alertChannel.setVibrationPattern(new long[]{0, 500, 250, 500, 250});
            alertChannel.setSound(alarmUri, audioAttr);
            nm.createNotificationChannel(alertChannel);
        }

        // Silent channel: HIGH importance, no sound
        if (nm.getNotificationChannel(CHANNEL_SILENT) == null) {
            NotificationChannel silentChannel = new NotificationChannel(
                CHANNEL_SILENT,
                "طلبات جديدة (صامت)",
                NotificationManager.IMPORTANCE_HIGH
            );
            silentChannel.setDescription("إشعارات الطلبات الجديدة بدون صوت");
            silentChannel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(silentChannel);
        }
    }
}
