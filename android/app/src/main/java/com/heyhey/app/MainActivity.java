package com.heyhey.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
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

    NotificationManager manager = getSystemService(NotificationManager.class);
    if (manager != null) {
      manager.createNotificationChannel(channel);
    }
  }
}
