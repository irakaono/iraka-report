const CACHE_NAME = 'iraka-field-v1.1.0';
const ASSETS = [
  './portal.html',
  './index.html',
  './completion.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      // 「iraka-field-」で始まる古いバージョンのみ削除
      keys.filter(k => k.startsWith('iraka-field-') && k !== CACHE_NAME)
          .map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  event.respondWith(
    // Network First：オンラインなら必ず最新版を取得
    fetch(event.request, {cache: 'no-store'}).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() =>
      // オフライン時はキャッシュから
      caches.match(event.request).then(cached => cached || caches.match('./portal.html'))
    )
  );
});
