const CACHE = 'propositi-v4';
const ASSETS = ['./', './index.html', './icon-192.png', './icon-512.png', './manifest.json'];

// ── Install: cache app shell ──────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
  // Load notification schedule from clients after activation
  loadAndScheduleNotifications();
});

// ── Fetch: serve from cache, fallback to network ──────────────────────────────
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      if (list.length > 0) return list[0].focus();
      return clients.openWindow('./');
    })
  );
});

// ── Message from main thread: receive schedule ────────────────────────────────
self.addEventListener('message', e => {
  if (e.data?.type === 'SCHEDULE_NOTIFICATIONS') {
    clearAllTimers();
    scheduleAll(e.data.items);
  }
});

// ── Notification scheduling ───────────────────────────────────────────────────

let activeTimers = [];

function clearAllTimers() {
  activeTimers.forEach(id => clearTimeout(id));
  activeTimers = [];
}

function scheduleAll(items) {
  // items = [{ title, body, tag, fireAt, actions }]
  const now = Date.now();
  items.forEach(item => {
    const delay = item.fireAt - now;
    if (delay < 0) return;
    const id = setTimeout(() => {
      self.registration.showNotification(item.title, {
        body: item.body,
        icon: './icon-192.png',
        badge: './icon-192.png',
        tag: item.tag,
        renotify: true,
        silent: false,
        vibrate: [300, 150, 300, 150, 600],
        requireInteraction: true,
        actions: [
          { action: 'open', title: 'Apri app' }
        ]
      });
    }, delay);
    activeTimers.push(id);
  });
}

async function loadAndScheduleNotifications() {
  // Ask open clients for the notification schedule
  const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  list.forEach(client => client.postMessage({ type: 'REQUEST_SCHEDULE' }));
}
