/* 甍AI Field — Service Worker
 * 方針:
 *   - Network First（オンラインなら常に最新を取得。cache:'no-store'）。
 *   - 古い iraka-field-* キャッシュは activate 時に削除。
 *   - precache は耐性版（allSettled）。1ファイル欠けても SW 更新ごと止めない（原則10）。
 *   - リリースのたびに CACHE_NAME を上げること（RELEASE_CHECKLIST 参照）。
 */
const CACHE_NAME = 'iraka-field-v2.39.2'; // v2.39.2: [F]再公開トリガー（内容は v2.39.1 と同じ／GitHub Pages に最新を publish させ直すためのバージョン更新）。 / v2.39.1: [F]Ver1-1 修正＝外形なり2面で「棟が中央に1本」創発することを保証（キャンバス配置の丸めで辺が潰れても棟が消えない：丸め→整形→軒index確定の順＋clean gable でなければ bbox フォールバック）。 / v2.39.0: [A]F-3 Ver1-1 外形なり面分割＝屋根下書きを bbox 近似から Resolver 外形なりの2面へ（L字/凹みに沿う・面積が実物に寄る）。面積保存を満たさない複雑形は安全に bbox へフォールバック。谷/方位別pitch/下屋は Ver1-3/1-2/1-4。 / v2.38.0: [A]Phase F 配線＝認識した建物外形を屋根として解釈（F-1→F-2→Resolver→F-3）。下書きが1面→分割面になり、ポーチ/出窓が外れ、棟/軒/ケラバ役割が創発。Runtime は RoofModel が正（F-4 RoofConfiguration は消費者待ちで経路外）。 / v2.37.0: [A]Phase E＝認識した建物外形(Building Footprint Candidate)をStudioへ結線。PDFを開くと実建物形状で下書きが置かれ、青い角つまみを壁角へドラッグで吸着する(Human Confirmation Layer)。認識失敗時は従来のプリセット下書きへ自動フォールバック(安全)。 / v2.36.0: [A]Phase B-1 編集性改善＝(1)屋根編集にも統合Undo/Redo（頂点移動・形・↻回転・下屋・水上変更・雨樋を1本の履歴で戻せる。ドラッグは drag end で1コミット) (2)平面から縦樋を外す（軒樋＋集水器のみ／縦樋長は0でなく「未確定＝立面で確定」表示・集水器数は確定） (3)片流れ ↻回転ボタン(0/90/180/270) (4)仮下書きバナー強化「AIの仮下書き・正確ではありません・3〜10秒で修正：①回転②角ドラッグ③確定」。縦樋の立面編集(Drain Runtime)はPhase 2。 / v2.35.0: [A]単位を「面」から「屋根系統（Roof Unit）」へ＝確認カードを主屋根＋下屋（系統）表記に。Reconcilerに屋根系統(建物の階層構造)Observationを追加し「系統ごとに確定」（主屋根=つかみ込み/下屋=雨押えを系統から）。真北優先＝北矢印>立面名称>不一致は確認 / v2.34.0: [A]下書きの面数を実際の屋根に合わせる＋水上既定(下屋=雨押え/壁に当たらない片棟=つかみ込み=WITHDOM片棟/軒) / v2.33.0: [A]R-2.5 Readerの見える化 / v2.32.0: [A]複数検出チップ / v2.31.0: [A]グリフ結合
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
