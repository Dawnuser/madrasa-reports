/* service worker — madrasa reports */
const CACHE = 'madrasa-v1';
const ASSETS = ['index.html', 'assets/logo.png', 'assets/icon-192.png', 'assets/icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  e.respondWith(
    fetch(e.request).catch(function () { return caches.match(e.request); })
  );
});

self.addEventListener('push', function (e) {
  const data = e.data ? e.data.json() : {};
  self.registration.showNotification(data.title || 'Madrasa Reports', {
    body: data.body || '',
    icon: 'assets/icon-192.png',
    badge: 'assets/icon-192.png',
    data: data.url || null
  });
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  if (e.notification.data) {
    e.waitUntil(clients.openWindow(e.notification.data));
  }
});