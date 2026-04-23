/// <reference lib="webworker" />

// Service Worker for Hey Hey - Push Notifications
// IMPORTANT: This SW does NOT cache HTML/JS/CSS to avoid stale content issues.
// Bump CACHE_VERSION on every release to force old caches to be cleared.
const CACHE_VERSION = 'heyhey-v3';

// Install: activate immediately, don't wait
self.addEventListener('install', (event) => {
  console.log('[SW] Installing', CACHE_VERSION);
  self.skipWaiting();
});

// Activate: clean ALL old caches and take control immediately
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating', CACHE_VERSION);
  event.waitUntil(
    (async () => {
      // Delete every cache that isn't current
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_VERSION)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
      // Take control of all open clients immediately
      await self.clients.claim();
      // Notify all clients there's a new SW active so they can reload
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => {
        client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
      });
    })()
  );
});

// Fetch: NETWORK-ONLY for navigation/HTML/JS/CSS to prevent stale app shell.
// We deliberately do NOT cache app assets — Vite hashes filenames so the browser
// HTTP cache handles versioning correctly. Caching here only causes ghost bugs.
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept Supabase, analytics, or cross-origin API calls
  if (url.origin !== self.location.origin) return;

  // For navigations (HTML), always go to network. If offline, fall back to a
  // simple message — we prefer "no app" over "stale app".
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(
        () =>
          new Response(
            '<h1>Sin conexión</h1><p>Reconéctate para continuar.</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          )
      )
    );
    return;
  }

  // Everything else: let the browser handle it normally (no SW caching)
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
    platform: 'whatsapp',
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
    silent: false,
    renotify: true,
    vibrate: [200, 100, 200],
    data: {
      url: '/dashboard',
      conversationId: data.conversationId,
      platform: data.platform,
    },
    actions: [
      { action: 'open', title: 'Abrir' },
      { action: 'dismiss', title: 'Descartar' },
    ],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  event.notification.close();

  if (event.action === 'dismiss') return;

  const urlToOpen = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes('/dashboard') && 'focus' in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});

// Message from main thread
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);

  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data?.type === 'NEW_MESSAGE') {
    const { title, body, conversationId, platform } = event.data;
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: `message-${conversationId}`,
      requireInteraction: false,
      silent: false,
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: '/dashboard', conversationId, platform },
    });
  }
});
