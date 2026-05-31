const CACHE_NAME = 'dancersbio-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// fetch 핸들러는 등록하지 않음 (RSC abort 이슈 회피).

// 푸시 endpoint 회전 처리 — 동일 VAPID로 자동 재구독.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const oldEndpoint = event.oldSubscription && event.oldSubscription.endpoint;
      const applicationServerKey = (event.oldSubscription && event.oldSubscription.options && event.oldSubscription.options.applicationServerKey) || null;
      if (!applicationServerKey) return;

      const newSub = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey,
      });

      const json = newSub.toJSON();
      const clientsList = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
      if (clientsList.length > 0) {
        try {
          await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              endpoint: json.endpoint,
              keys: json.keys,
              ua: 'sw-pushsubscriptionchange',
              oldEndpoint: oldEndpoint || undefined,
            }),
          });
        } catch (_e) {}
      }
    } catch (_err) {}
  })());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'deetz';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-mono.png',
    data: { url: data.url || '/feed' },
    tag: data.tag,
    requireInteraction: !!data.requireInteraction,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/feed';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      for (const c of cs) {
        try {
          const u = new URL(c.url);
          if (u.pathname === url || c.url.endsWith(url)) {
            return c.focus();
          }
        } catch (_e) {}
      }
      return self.clients.openWindow(url);
    })
  );
});
