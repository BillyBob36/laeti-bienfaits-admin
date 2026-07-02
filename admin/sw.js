/* Service worker — notifications push (nouvelles réservations) + app installable. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'Nouvelle demande de rendez-vous';
  const opts = {
    body: d.body || '',
    icon: '/admin/icon-192.png',
    badge: '/admin/icon-192.png',
    tag: d.tag || 'rdv',
    renotify: true,
    vibrate: [120, 60, 120],
    data: { url: d.url || '/admin/' },
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/admin/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if (c.url.indexOf('/admin') >= 0 && 'focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
