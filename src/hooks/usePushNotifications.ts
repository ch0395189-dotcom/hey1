import { useState, useEffect, useCallback, useRef } from 'react';

interface PushNotificationData {
  title: string;
  body: string;
  conversationId?: string;
  platform?: string;
}

interface UsePushNotificationsReturn {
  isSupported: boolean;
  isRegistered: boolean;
  permission: NotificationPermission | 'default';
  registerServiceWorker: () => Promise<boolean>;
  sendNotification: (data: PushNotificationData) => void;
}

export const usePushNotifications = (): UsePushNotificationsReturn => {
  const [isSupported, setIsSupported] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'default'>('default');
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    // Check if service workers and push are supported
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);
    
    if (supported) {
      setPermission(Notification.permission);
      
      // Check if already registered
      navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration) {
          swRegistrationRef.current = registration;
          setIsRegistered(true);
          console.log('[Push] Service worker already registered');
        }
      });
    }
  }, []);

  const registerServiceWorker = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      console.warn('[Push] Push notifications not supported');
      return false;
    }

    try {
      // Request notification permission first
      if (Notification.permission === 'default') {
        const result = await Notification.requestPermission();
        setPermission(result);
        if (result !== 'granted') {
          console.warn('[Push] Notification permission denied');
          return false;
        }
      } else if (Notification.permission === 'denied') {
        console.warn('[Push] Notifications are blocked');
        return false;
      }

      // Register service worker
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });

      console.log('[Push] Service worker registered:', registration.scope);
      swRegistrationRef.current = registration;
      setIsRegistered(true);

      // Wait for service worker to be ready
      await navigator.serviceWorker.ready;
      console.log('[Push] Service worker ready');

      return true;
    } catch (error) {
      console.error('[Push] Registration failed:', error);
      return false;
    }
  }, [isSupported]);

  const sendNotification = useCallback((data: PushNotificationData) => {
    if (!swRegistrationRef.current?.active) {
      console.warn('[Push] No active service worker');
      return;
    }

    // Don't send notification if tab is focused
    if (document.visibilityState === 'visible') {
      console.log('[Push] Tab is visible, skipping notification');
      return;
    }

    // Send message to service worker to show notification
    swRegistrationRef.current.active.postMessage({
      type: 'NEW_MESSAGE',
      ...data
    });
  }, []);

  return {
    isSupported,
    isRegistered,
    permission,
    registerServiceWorker,
    sendNotification,
  };
};
