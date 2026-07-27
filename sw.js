/* 甍AI Field — Service Worker
 * 方針:
 *   - Network First（オンラインなら常に最新を取得。cache:'no-store'）。
 *   - 古い iraka-field-* キャッシュは activate 時に削除。
 *   - precache は耐性版（allSettled）。1ファイル欠けても SW 更新ごと止めない（原則10）。
 *   - リリースのたびに CACHE_NAME を上げること（RELEASE_CHECKLIST 参照）。
 */
const CACHE_NAME = 'iraka-field-v2.24.0'; // v2.24.0: [A]積算スタジオ 屋根入力を「形から始める」導線に（AIナビ③で片流れ/切妻/寄棟を選ぶ→角を合わせる・平面図/立面図の役割を明示・片流れ水下選択）UNLOCK / v2.23.0: [B]印刷改善②原因欄全文表示 / v2.22.0: [B]Phase0 Fixture Export＋実データPDF4件 / [A]Phase A#2 採用版管理
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
