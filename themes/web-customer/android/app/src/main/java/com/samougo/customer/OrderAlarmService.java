package com.samougo.customer;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.media.MediaPlayer;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

/**
 * Foreground service that plays the order alarm ringtone on loop.
 *
 * Started by {@link OrderAlarmReceiver} when a high-priority order push
 * notification arrives while the app is killed or backgrounded.
 *
 * The service runs as a foreground service with a persistent notification
 * (required by Android 8+ for background audio). It plays the alarm on
 * loop for up to 60 seconds, or until:
 *   - The user opens the app (JS calls StopAlarmPlugin.stop())
 *   - The order is accepted/claimed (JS calls StopAlarmPlugin.stop())
 *   - The 60-second timeout elapses
 *
 * Stopped by: {@link StopAlarmPlugin} (Capacitor bridge), or self-timeout.
 */
public class OrderAlarmService extends Service {

    private static final String TAG = "OrderAlarmService";
    private static final String CHANNEL_ID = "orders_high_priority";
    private static final int FOREGROUND_NOTIFICATION_ID = 9999;
    private static final long MAX_RING_DURATION_MS = 60_000; // 60 seconds

    private MediaPlayer mediaPlayer;
    private PowerManager.WakeLock wakeLock;
    private boolean isPlaying = false;

    /** Timeout handler — stops the alarm after MAX_RING_DURATION_MS. */
    private final Runnable timeoutRunnable = () -> {
        Log.i(TAG, "Alarm timeout reached — stopping");
        stopSelf();
    };

    @Override
    public IBinder onBind(Intent intent) {
        return null; // Not a bound service
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.i(TAG, "OrderAlarmService started");

        // Acquire a partial wake lock so the CPU stays alive to play audio
        // even if the screen is off and the device tries to sleep.
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "SamouGo::OrderAlarm"
            );
            wakeLock.acquire(MAX_RING_DURATION_MS + 5000); // safety margin
        }

        // Show foreground notification (required for foreground services on Android 8+)
        startForeground(FOREGROUND_NOTIFICATION_ID, buildNotification());

        // Start playing the alarm
        startAlarm();

        // Auto-stop after MAX_RING_DURATION_MS
        new android.os.Handler(getMainLooper()).postDelayed(timeoutRunnable, MAX_RING_DURATION_MS);

        // If the system kills the service, don't restart it
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        Log.i(TAG, "OrderAlarmService destroyed");
        stopAlarm();
        super.onDestroy();
    }

    /** Start playing the alarm ringtone on loop. */
    private void startAlarm() {
        if (isPlaying) return;

        try {
            Uri alarmUri = Uri.parse(
                "android.resource://" + getPackageName() + "/raw/order_alarm"
            );

            mediaPlayer = new MediaPlayer();
            mediaPlayer.setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM) // USAGE_ALARM bypasses Do Not Disturb
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            );
            mediaPlayer.setDataSource(this, alarmUri);
            mediaPlayer.setLooping(true); // Loop until stopped
            mediaPlayer.prepare();
            mediaPlayer.start();
            isPlaying = true;

            Log.i(TAG, "Alarm playing (looping)");
        } catch (Exception e) {
            Log.e(TAG, "Failed to start alarm", e);
            stopSelf();
        }
    }

    /** Stop the alarm and release resources. */
    private void stopAlarm() {
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) {
                    mediaPlayer.stop();
                }
                mediaPlayer.release();
            } catch (Exception e) {
                Log.w(TAG, "Error stopping MediaPlayer", e);
            }
            mediaPlayer = null;
        }
        isPlaying = false;

        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
            wakeLock = null;
        }

        // Remove the timeout callback
        new android.os.Handler(getMainLooper()).removeCallbacks(timeoutRunnable);

        // Cancel the foreground notification
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) {
            nm.cancel(FOREGROUND_NOTIFICATION_ID);
        }
    }

    /** Build the persistent foreground notification shown while the alarm plays. */
    private Notification buildNotification() {
        // Tap notification → open the app
        Intent launchIntent = getPackageManager()
            .getLaunchIntentForPackage(getPackageName());
        if (launchIntent != null) {
            launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        }
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }

        return builder
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentTitle("🚫 طلب جديد —ật/order alert")
            .setContentText("افتح التطبيق لعرض الطلب / Open app to view order")
            .setOngoing(true) // Cannot be swiped away
            .setFullScreenIntent(pendingIntent, false)
            .setContentIntent(pendingIntent)
            .setAutoCancel(false)
            .build();
    }

    /**
     * Public method called by StopAlarmPlugin to stop the alarm immediately.
     * Called from JavaScript when the user opens the app or accepts the order.
     */
    public static void stopAlarmFromPlugin(OrderAlarmService service) {
        if (service != null) {
            service.stopAlarm();
            service.stopSelf();
        }
    }
}
