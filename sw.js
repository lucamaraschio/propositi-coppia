// ── Firebase Messaging (compat SDK — necessario nel SW) ──────────────────────
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyBqa-_PGzgJao0ao4mkjSf7hYOdwamsWUs",
  authDomain:        "propositi-coppia.firebaseapp.com",
  projectId:         "propositi-coppia",
  storageBucket:     "propositi-coppia.firebasestorage.app",
  messagingSenderId: "231595342369",
  appId:             "1:231595342369:web:a997b2cfc9738b7c6fc160",
  databaseURL:       "https://propositi-coppia-default-rtdb.europe-west1.firebasedatabase.app",
});

const messaging = firebase.messaging();

// Gestisce le notifiche FCM quando l'app è in background / chiusa
messaging.onBackgroundMessage(payload => {
  const n = payload.notification || {};
  self.registration.showNotification(n.title || 'Propositi 💕', {
    body:               n.body || '',
    icon:               './icon-192.png',
    badge:              './icon-192.png',
    vibrate:            [300, 150, 300, 150, 600],
    requireInteraction: true,
    data:               { url: 'https://lucamaraschio.github.io/propositi-coppia/' },
  });
});

// ── Cache & offline ───────────────────────────────────────────────────────────
const CACHE  = 'propositi-v5';
const ASSETS = ['./', './index.html', './icon-192.png', './icon-512.png', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)));
});

// Apre l'app al click della notifica
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || './';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes('propositi-coppia'));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});
