// sw.js — service worker HITREVIL
const CACHE_NAME = 'hitrevil-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './modal.js',
  './settings.js',
  './manifest.json'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  const url = new URL(event.request.url);

  // Запросы к API (activate, check, upload) — только сеть, без кэша
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Остальное — сначала кэш, потом сеть
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      return cached || fetch(event.request).then(function(response) {
        if (url.origin !== location.origin) return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, copy);
        });
        return response;
      }).catch(function() {
        return caches.match('./index.html');
      });
    })
  );
});