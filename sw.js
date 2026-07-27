/* 甍AI Field — Service Worker
 * 方針:
 *   - Network First（オンラインなら常に最新を取得。cache:'no-store'）。
 *   - 古い iraka-field-* キャッシュは activate 時に削除。
 *   - precache は耐性版（allSettled）。1ファイル欠けても SW 更新ごと止めない（原則10）。
 *   - リリースのたびに CACHE_NAME を上げること（RELEASE_CHECKLIST 参照）。
 */
const CACHE_NAME = 'iraka-field-v2.30.0'; // v2.30.0: [A]Phase B 確認ファースト B-1＝取り込み直後「AIの理解」確認カード（形/縮尺/勾配/軒の出/雨樋を1枚で確認→この内容で進む・編集は例外）UNLOCK / v2.29.0: [A]立面図から勾配・軒の出 / v2.28.0: [A]水上納まり＋辺編集 / v2.27.0: [A]角つまみ・図面ドラッグ
const ASSETS = [
  './portal.html',
  './index.html',
  './completion.html',
  './projects.html',
  './project.html',
  './estimation.html',
  './recovery.html',
  './recovery-selftest.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './js/config.js',
  './js/db.js',
  './js/project-api.js',
  './js/report-api.js',
  './js/report-bridge.js',
  './js/estimation-bridge.js',
  './js/recovery-core.js',
  './js/irbk.js',
  './js/media-manager.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(ASSETS.map(url => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith('iraka-field-') && k !== CACHE_NAME)
          .map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request, { cache: 'no-store' }).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() =>
      caches.match(event.request).then(cached => cached || caches.match('./portal.html'))
    )
  );
});
