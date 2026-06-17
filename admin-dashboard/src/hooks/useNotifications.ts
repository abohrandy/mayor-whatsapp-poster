import { useEffect } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import type { Token, PermissionStatus } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

export const useNotifications = () => {
  useEffect(() => {
    // Only run on native platforms
    if (!Capacitor.isNativePlatform()) {
      console.log('[Notifications] Running on web, skipping push notifications registration.');
      return;
    }

    const setupNotifications = async () => {
      try {
        // 1. Check/Request Local Notification Permissions
        const localPerm = await LocalNotifications.checkPermissions();
        if (localPerm.display !== 'granted') {
          await LocalNotifications.requestPermissions();
        }

        // 2. Check/Request Push Notification Permissions
        let pushPerm: PermissionStatus = await PushNotifications.checkPermissions();
        if (pushPerm.receive !== 'granted') {
          pushPerm = await PushNotifications.requestPermissions();
        }

        if (pushPerm.receive === 'granted') {
          // Register with Apple / Google push services
          await PushNotifications.register();
        } else {
          console.warn('[Notifications] Push notification permission denied.');
        }

        // 3. Setup Listeners
        await registerPushListeners();

      } catch (err) {
        console.error('[Notifications] Failed setting up notifications:', err);
      }
    };

    const registerPushListeners = async () => {
      // Successfully registered and got token
      await PushNotifications.addListener('registration', (token: Token) => {
        console.log('[Notifications] Push Registration Token:', token.value);
        // In production, send this token to the express backend (e.g. POST /api/users/push-token)
      });

      // Error registering
      await PushNotifications.addListener('registrationError', (error: any) => {
        console.error('[Notifications] Push Registration Error:', JSON.stringify(error));
      });

      // Received push notification while app is in foreground
      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('[Notifications] Push Received (Foreground):', notification);
        // Show as a local notification or custom alert banner since native OS push banner won't show in foreground on some platforms
        triggerLocalNotification(
          notification.title || 'New Notification',
          notification.body || ''
        );
      });

      // User clicked on push notification banner
      await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        console.log('[Notifications] Push Action Clicked:', notification);
      });
    };

    setupNotifications();

    // Clean up listeners on unmount
    return () => {
      if (Capacitor.isNativePlatform()) {
        PushNotifications.removeAllListeners();
      }
    };
  }, []);

  // Helper function to trigger instant local notifications
  const triggerLocalNotification = async (title: string, body: string) => {
    try {
      if (!Capacitor.isNativePlatform()) {
        // Web fallback
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(title, { body });
        } else if ('Notification' in window && Notification.permission !== 'denied') {
          const status = await Notification.requestPermission();
          if (status === 'granted') {
            new Notification(title, { body });
          }
        }
        return;
      }

      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Math.random() * 100000),
            title,
            body,
            schedule: { at: new Date(Date.now() + 500) }, // Trigger in 500ms
            sound: undefined,
            attachments: [],
            actionTypeId: '',
            extra: null
          }
        ]
      });
    } catch (err) {
      console.error('[Notifications] Error triggering local notification:', err);
    }
  };

  return { triggerLocalNotification };
};
