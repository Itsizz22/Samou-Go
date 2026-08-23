package com.samougo.customer;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  /** Standard order notifications (sound = device default). */
  private static final String CHANNEL_ORDERS = "samou-go-orders";

  /** High-priority order alarm — plays a looping 10-second ringtone even when the app is killed. */
  private static final String CHANNEL_ORDERS_HIGH = "orders_high_priority";

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    createNotificationChannels();
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
    // Custom sound: the looping order_alarm.wav ringtone.
    Uri alarmUri = Uri.parse(
      "android.resource://" + getPackageName() + "/raw/order_alarm"
    );
    AudioAttributes audioAttr = new AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build();

    NotificationChannel highChannel = new NotificationChannel(
      CHANNEL_ORDERS_HIGH,
      "Order Alerts",
      NotificationManager.IMPORTANCE_HIGH
    );
    highChannel.setDescription("High-priority order alerts with alarm ringtone");
    highChannel.setLockscreenVisibility(NotificationManager.VISIBILITY_PUBLIC);
    highChannel.enableVibration(true);
    highChannel.setVibrationPattern(new long[]{0, 300, 200, 300});
    highChannel.setSound(alarmUri, audioAttr);
    nm.createNotificationChannel(highChannel);
  }
}
