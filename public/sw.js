/// <reference lib="webworker" />

// Service Worker for Hey Hey - Push Notifications and Background Sync
const CACHE_NAME = 'heyhey-v1';
const SUPABASE_URL_PATTERN = /supabase\.co/;

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Push notification event
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');
  
  let data = {
    title: 'Hey Hey',
    body: 'Tienes un nuevo mensaje',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: 'new-message',
    platform: 'whatsapp'
  };
  
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (e) {
    console.log('[SW] Error parsing push data:', e);
  }
  
  const options = {
    body: data.body,
    icon: data.icon || '/pwa-192x192.png',
    badge: data.badge || '/pwa-192x192.png',
    tag: data.tag || 'new-message',
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: {
      url: '/dashboard',
      conversationId: data.conversationId,
      platform: data.platform
    },
    actions: [
      { action: 'open', title: 'Abrir' },
      { action: 'dismiss', title: 'Descartar' }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  
  event.notification.close();
  
  if (event.action === 'dismiss') {
    return;
  }
  
  const urlToOpen = event.notification.data?.url || '/dashboard';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Try to focus existing window
        for (const client of clientList) {
          if (client.url.includes('/dashboard') && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window if none exists
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});

// Background sync for messages
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  }
});

async function syncMessages() {
  console.log('[SW] Syncing messages...');
  // This would sync any pending messages when back online
  // Implementation depends on IndexedDB storage of pending messages
}

// Message from main thread
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'NEW_MESSAGE') {
    // Show notification for new message received via realtime
    const { title, body, conversationId, platform } = event.data;
    
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: `message-${conversationId}`,
      requireInteraction: false,
      vibrate: [200, 100, 200],
      data: {
        url: '/dashboard',
        conversationId,
        platform
      }
    });
  }
});

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-messages') {
    event.waitUntil(checkNewMessages());
  }
});

async function checkNewMessages() {
  console.log('[SW] Checking for new messages...');
  // Would check Supabase for new messages
  // This requires storing auth token in IndexedDB
}
