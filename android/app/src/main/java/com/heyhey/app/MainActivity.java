package com.heyhey.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  private static final String CHANNEL_ID = "heyhey_messages";

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    createDefaultNotificationChannel();
  }

  private void createDefaultNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

    NotificationChannel channel = new NotificationChannel(
      CHANNEL_ID,
      "Mensajes Hey Hey",
      NotificationManager.IMPORTANCE_HIGH
    );
    channel.setDescription("Notificaciones de mensajes nuevos en Hey Hey");
    channel.enableVibration(true);
    channel.enableLights(true);
    channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
    channel.setShowBadge(true);
    // Sonido explícito: sin esto algunos fabricantes crean el canal en silencio
    // y la notificación no suena con la app cerrada.
    Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
    AudioAttributes attrs = new AudioAttributes.Builder()
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .setUsage(AudioAttributes.USAGE_NOTIFICATION)
      .build();
    channel.setSound(sound, attrs);

    NotificationManager manager = getSystemService(NotificationManager.class);
    if (manager != null) {
      manager.createNotificationChannel(channel);
    }
  }
}
