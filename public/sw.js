/// <reference lib="webworker" />

// Service Worker for Hey Hey - Push Notifications
// IMPORTANT: This SW does NOT cache HTML/JS/CSS to avoid stale content issues.
// Bump CACHE_VERSION on every release to force old caches to be cleared.
const CACHE_VERSION = 'heyhey-v13-no-precache';

// Offline fallback page: retries automatically instead of dead-ending the user.
const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Reconectando…</title>
<style>
  html,body{height:100%;margin:0}
  body{display:flex;align-items:center;justify-content:center;padding:24px;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    background:#0b141a;color:#e9edef;text-align:center}
  .box{max-width:320px}
  h1{font-size:20px;margin:0 0 8px}
  p{font-size:14px;opacity:.75;margin:0 0 20px;line-height:1.5}
  button{background:#25d366;color:#0b141a;border:0;border-radius:999px;
    padding:12px 28px;font-size:15px;font-weight:600}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;
    background:#25d366;margin-right:6px;animation:p 1.2s infinite}
  @keyframes p{0%,100%{opacity:.3}50%{opacity:1}}
</style></head>
<body><div class="box">
  <h1><span class="dot"></span>Reconectando…</h1>
  <p>La conexión falló por un momento. Estamos reintentando automáticamente.</p>
  <button onclick="location.reload()">Reintentar ahora</button>
</div>
<script>
  var tries = 0;
  function retry(){ if (navigator.onLine) location.reload(); }
  window.addEventListener('online', retry);
  setInterval(function(){ tries++; if (tries < 40) retry(); }, 3000);
<\/script>
</body></html>`;

const NOTIFICATION_ICON = '/pwa-192x192.png';

function notificationOptions(options) {
  const base = {
    body: options.body || 'Tienes una nueva notificación',
    icon: options.icon || NOTIFICATION_ICON,
    badge: options.badge || NOTIFICATION_ICON,
    tag: options.tag || `heyhey-${Date.now()}`,
    data: options.data || { url: '/dashboard' },
  };

  // Safari/iOS Web Push rejects Chromium-only fields such as actions/vibrate.
  const isApplePush = self.registration?.pushManager?.supportedContentEncodings?.includes('aes128gcm') === false;
  if (isApplePush) return base;

  return {
    ...base,
    requireInteraction: options.requireInteraction ?? false,
    silent: false,
    renotify: true,
    vibrate: [200, 100, 200],
    actions: options.actions,
  };
}

async function showHeyHeyNotification(title, options) {
  try {
    await self.registration.showNotification(title || 'Hey Hey', notificationOptions(options || {}));
  } catch (error) {
    console.log('[SW] showNotification fallback:', error);
    await self.registration.showNotification(title || 'Hey Hey', {
      body: options?.body || 'Tienes una nueva notificación',
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_ICON,
      tag: options?.tag || `heyhey-${Date.now()}`,
      data: options?.data || { url: '/dashboard' },
    });
  }
}

// Set to true to force a full logout on every release (clears Supabase auth
// tokens too). Leave false to preserve sessions across updates.
const FORCE_LOGOUT_ON_UPDATE = false;

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
      // and trigger client-side storage/cookie cleanup for the new version.
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => {
        client.postMessage({
          type: 'SW_UPDATED',
          version: CACHE_VERSION,
          clearStorage: true,
          forceLogout: FORCE_LOGOUT_ON_UPDATE,
        });
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
      (async () => {
        // Mobile networks drop the first request often — retry before giving up.
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            return await fetch(req, { cache: 'no-store' });
          } catch (e) {
            if (attempt < 2) await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
          }
        }
        return new Response(OFFLINE_HTML, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      })()
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

  // ---- E2E verification: ACK back to the server before showing anything ----
  if (data.verifyToken && data.verifyUrl) {
    event.waitUntil((async () => {
      // iOS/Chrome require a user-visible notification promptly for every push.
      await showHeyHeyNotification('Hey Hey ✅ Verificado', {
        body: 'Este dispositivo recibió la prueba de notificaciones correctamente.',
        tag: data.tag || 'verify',
        data: { url: '/dashboard', verify: true },
      });

      try {
        await fetch(data.verifyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'ack', token: data.verifyToken }),
        });
      } catch (e) {
        console.log('[SW] verify ack failed:', e);
      }
    })());
    return;
  }

  const options = {
    body: data.body,
    icon: data.icon || NOTIFICATION_ICON,
    badge: data.badge || NOTIFICATION_ICON,
    tag: data.tag || 'new-message',
    requireInteraction: true,
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

  event.waitUntil(showHeyHeyNotification(data.title, options));
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
    showHeyHeyNotification(title, {
      body,
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_ICON,
      tag: `message-${conversationId}`,
      data: { url: '/dashboard', conversationId, platform },
    });
  }
});
