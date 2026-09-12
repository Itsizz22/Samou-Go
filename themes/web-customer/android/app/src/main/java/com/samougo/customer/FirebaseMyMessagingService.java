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
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Firebase Cloud Messaging service that handles incoming push notifications
 * when the app is in the foreground, background, or completely killed.
 *
 * <p>For data-only messages (no {@code notification} key in the payload),
 * Android routes eligible messages through {@code onMessageReceived()}, even when the
 * app process is stopped (not force-stopped in Settings). This service then builds a custom notification on the
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
    public static final String CHANNEL_FOREGROUND = "orders_in_app_v1";
    public static final String CHANNEL_PREPARATION = "preparation_updates_v1";
    public static final String CHANNEL_ALERT = "orders_alert_channel";
    /** Channel for silent notifications (no sound). */
    public static final String CHANNEL_SILENT = "orders_silent_channel_v2";

    /** SharedPreferences file used by both this service and the SettingsPlugin. */
    public static final String PREFS_NAME = "samou_go_settings";
    /** Key for the "ring on new order" boolean preference. */
    public static final String KEY_RING_ON_ORDER = "ring_on_new_order";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Log.i(TAG, "onMessageReceived — from: " + remoteMessage.getFrom());

        // Forward bridge events and render foreground messages natively. Mixed
        // notification/data payloads are rendered by FCM itself in background.
        PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
        if (!androidx.core.app.NotificationManagerCompat.from(this).areNotificationsEnabled()) return;
        Map<String, String> data = remoteMessage.getData();
        String orderId = data.get("orderId");
        String type = data.get("type");
        String title = data.get("title");
        String body = data.get("body");
        RemoteMessage.Notification notification = remoteMessage.getNotification();
        if (notification != null) {
            if (title == null) title = notification.getTitle();
            if (body == null) body = notification.getBody();
        }
        if (title == null) title = "سموع كويك";
        if (body == null) body = "";

        if ("PREPARATION_REMINDER".equals(type) || "PREPARATION_AVAILABLE".equals(type) || "RESERVATION_RELEASED".equals(type)) {
            String expiresAt = data.get("expiresAt");
            if (expiresAt != null) {
                try { if (Long.parseLong(expiresAt) <= System.currentTimeMillis()) return; }
                catch (NumberFormatException invalidExpiry) { return; }
            }
            showNotification(title, body, orderId, CHANNEL_PREPARATION, data.get("notificationLogId"));
            return;
        }

        if ("custom-requests".equals(data.get("screen"))) {
            showNotification(title, body, null, MainActivity.isUserActive(this) ? CHANNEL_FOREGROUND : "orders_high_priority", data.get("notificationLogId"), data.get("customRequestId"), data.get("audience"), data.get("storeId"));
            return;
        }
        if ("CHAT_MESSAGE".equals(type)) {
            showNotification(title, body, orderId, MainActivity.isUserActive(this) ? CHANNEL_FOREGROUND : "orders_high_priority", data.get("notificationLogId"), null, null, null, data.get("senderId"));
            return;
        }
        boolean isCaptainOrStoreNotification =
            "NEW_ORDER".equals(type) || "NEW_ORDER_ALERT".equals(type) ||
            "CAPTAIN_ASSIGN".equals(type);

        // Customer updates must also show a banner in foreground.
        if (!isCaptainOrStoreNotification) {
            showNotification(title, body, orderId, MainActivity.isUserActive(this) ? CHANNEL_FOREGROUND : "orders_high_priority", data.get("notificationLogId"));
            return;
        }

        // Check the user's "ring on new order" preference
        boolean ringEnabled = getRingPreference();

        // Determine which notification channel to use
        boolean userActive = MainActivity.isUserActive(this);
        String channelId = ringEnabled ? (userActive ? CHANNEL_FOREGROUND : CHANNEL_ALERT) : CHANNEL_SILENT;
        Log.i(TAG, "Showing notification on channel: " + channelId +
              " (ring preference: " + ringEnabled + ")");

        // Build and show the notification
        showNotification(title, body, orderId, channelId, data.get("notificationLogId"));

        // If ringing is enabled, start the OrderAlarmService for continuous alert
        // (the system notification plays the channel sound once, but the foreground
        // service loops it until the user acknowledges).
        if (ringEnabled && !userActive && orderId != null) {
            OrderAlarmReceiver.processNotification(this, orderId, title, body, data.get("notificationLogId"));
        }
    }

    @Override
    public void onNewToken(@NonNull String token) {
        Log.i(TAG, "FCM token refreshed");
        PushNotificationsPlugin.onNewToken(token);
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
    private void showNotification(String title, String body, String orderId, String channelId, String notificationLogId) {
        showNotification(title, body, orderId, channelId, notificationLogId, null, null, null);
    }
    private void showNotification(String title, String body, String orderId, String channelId, String notificationLogId, String customRequestId, String audience, String storeId) {
        showNotification(title, body, orderId, channelId, notificationLogId, customRequestId, audience, storeId, null);
    }
    private void showNotification(String title, String body, String orderId, String channelId, String notificationLogId, String customRequestId, String audience, String storeId, String chatSenderId) {
        Context context = getApplicationContext();

        // Create channels if they don't exist yet (idempotent)
        ensureChannelsExist(context);

        // Build the deep-link intent: opens the app and navigates to
        // /orders/:orderId via the SPA router.
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (orderId != null) {
            intent.putExtra("notificationLogId", notificationLogId);
            intent.putExtra("orderId", orderId);
            intent.putExtra("google.message_id", "order-" + orderId);
            intent.putExtra("clickAction", "OPEN_ORDER");
        }

        if (customRequestId != null) {
            intent.putExtra("google.message_id", "custom-" + customRequestId);
            intent.putExtra("customRequestId", customRequestId);
            intent.putExtra("screen", "custom-requests");
            intent.putExtra("audience", audience);
            intent.putExtra("storeId", storeId);
            intent.putExtra("notificationLogId", notificationLogId);
        }
        if (chatSenderId != null && orderId != null) {
            intent.putExtra("type", "CHAT_MESSAGE");
            intent.putExtra("senderId", chatSenderId);
            intent.putExtra("google.message_id", "chat-" + orderId + "-" + chatSenderId);
        }
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            chatSenderId != null ? ("chat:" + orderId + ":" + chatSenderId).hashCode() : orderId != null ? orderId.hashCode() : customRequestId != null ? customRequestId.hashCode() : 0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Derive a stable notification ID from the orderId so multiple
        // incoming orders produce distinct notifications.
        int notificationId = chatSenderId != null ? ("chat:" + orderId + ":" + chatSenderId).hashCode() : orderId != null
            ? (CHANNEL_PREPARATION.equals(channelId) ? ("preparation:" + orderId).hashCode() : orderId.hashCode())
            : (int) (System.currentTimeMillis() % Integer.MAX_VALUE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_order_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(CHANNEL_ALERT.equals(channelId) ? NotificationCompat.CATEGORY_ALARM : NotificationCompat.CATEGORY_STATUS)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setDefaults(NotificationCompat.DEFAULT_VIBRATE);

        if (orderId != null && (CHANNEL_ALERT.equals(channelId) || CHANNEL_SILENT.equals(channelId))) {
            Intent mute = new Intent(this, OrderAlarmReceiver.class);
            mute.setAction(OrderAlarmReceiver.ACTION_STOP_ALARM);
            mute.putExtra("notificationId", notificationId);
            PendingIntent muteIntent = PendingIntent.getBroadcast(this, notificationId, mute,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            builder.addAction(android.R.drawable.ic_menu_view, "عرض الطلب", pendingIntent);
            builder.addAction(android.R.drawable.ic_lock_silent_mode, "تجاهل / كتم", muteIntent);
        }

        // Let Android decide whether to launch over the lock screen or show heads-up.
        if (CHANNEL_ALERT.equals(channelId) && orderId != null) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (Build.VERSION.SDK_INT < 34 || (manager != null && manager.canUseFullScreenIntent())) {
                builder.setFullScreenIntent(OrderAlertActivity.pendingIntent(this, orderId, title, body, notificationLogId), true);
            }
            builder.setContentIntent(OrderAlertActivity.pendingIntent(this, orderId, title, body, notificationLogId));
        }

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
            if (orderId != null && CHANNEL_ALERT.equals(channelId)) {
                // Readiness must be a new interrupt, not an update of the
                // earlier low-importance preparation reminder for this order.
                nm.cancel(("preparation:" + orderId).hashCode());
                nm.cancel(notificationId);
            }
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
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (nm.getNotificationChannel(CHANNEL_FOREGROUND) == null) {
            NotificationChannel foreground = new NotificationChannel(CHANNEL_FOREGROUND,
                "تنبيه أثناء استخدام التطبيق", NotificationManager.IMPORTANCE_HIGH);
            foreground.setDescription("نغمة واحدة دون رنين متكرر أثناء استخدام التطبيق");
            foreground.setSound(android.provider.Settings.System.DEFAULT_NOTIFICATION_URI,
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build());
            foreground.enableVibration(true);
            nm.createNotificationChannel(foreground);
        }

        if (nm.getNotificationChannel(CHANNEL_PREPARATION) == null) {
            NotificationChannel preparation = new NotificationChannel(CHANNEL_PREPARATION,
                "تذكيرات التحضير والحجز", NotificationManager.IMPORTANCE_DEFAULT);
            preparation.setDescription("تذكير قصير بموعد استلام الطلب المتوقع");
            preparation.setSound(android.provider.Settings.System.DEFAULT_NOTIFICATION_URI,
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build());
            preparation.enableVibration(true);
            nm.createNotificationChannel(preparation);
        }
        if (nm.getNotificationChannel("orders_high_priority") == null) {
            NotificationChannel updates = new NotificationChannel("orders_high_priority",
                "تنبيهات الطلبات", NotificationManager.IMPORTANCE_HIGH);
            updates.enableVibration(true);
            nm.createNotificationChannel(updates);
        }

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
            silentChannel.setSound(null, null);
            silentChannel.enableVibration(false);
            silentChannel.setDescription("إشعارات الطلبات الجديدة بدون صوت");
            silentChannel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(silentChannel);
        }
    }
}
