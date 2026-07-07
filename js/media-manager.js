/**
 * Media Manager（甍AIシステム共通・写真管理レイヤー）
 * -----------------------------------------------------------
 * 目的: 「保存容量」と「描画メモリ」は別問題という前提のもと、
 *   ① IndexedDBへのBlob保存（base64より効率的）
 *   ② サムネイル／フル解像度の分離
 *   ③ IntersectionObserverによる遅延読み込み
 *   ④ 用途に応じた解像度の出し分け（画面表示・印刷品質モード）
 * を提供する。報告書アプリ(index.html)・AI積算システム(estimate.html)・
 * 将来の図面Annotation機能など、写真/画像を扱う画面から共通で呼び出す想定。
 *
 * 使い方:
 *   <script src="./js/media-manager.js"></script>
 *   MediaManager.idbPut(key, blob) / MediaManager.idbGet(key) など
 */
(function (global) {
  'use strict';

  const DB_NAME = 'iraka_media_db';
  const STORE_NAME = 'media';
  let _dbPromise = null;

  function idbOpen() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      if (!global.indexedDB) { reject(new Error('IndexedDB未対応のブラウザです')); return; }
      const req = global.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE_NAME); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return _dbPromise;
  }

  function idbPut(key, value) {
    return idbOpen().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    }));
  }

  function idbGet(key) {
    return idbOpen().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  function idbDelete(key) {
    return idbOpen().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    }));
  }

  function idbDeleteByPrefix(prefix) {
    return idbOpen().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) return;
        if (String(cursor.key).startsWith(prefix)) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    }));
  }

  // ===== Object URL 管理（作りっぱなしによるメモリリークを防ぐ） =====
  const _activeObjectURLs = new Set();
  function trackObjectURL(url) { _activeObjectURLs.add(url); return url; }
  function revokeObjectURL(url) {
    if (url && _activeObjectURLs.has(url)) {
      try { global.URL.revokeObjectURL(url); } catch (e) { /* noop */ }
      _activeObjectURLs.delete(url);
    }
  }

  // ===== Canvas描画・Blob変換 =====
  function _canvasToBlob(canvas, type, quality) {
    return new Promise(resolve => {
      if (canvas.toBlob) {
        canvas.toBlob(blob => resolve(blob || _dataURLtoBlobFallback(canvas, quality)), type, quality);
      } else {
        resolve(_dataURLtoBlobFallback(canvas, quality));
      }
    });
  }
  function _dataURLtoBlobFallback(canvas, quality) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const bstr = atob(dataUrl.split(',')[1]);
    let n = bstr.length; const u8 = new Uint8Array(n);
    while (n--) { u8[n] = bstr.charCodeAt(n); }
    return new Blob([u8], { type: 'image/jpeg' });
  }

  function drawToCanvasBlob(img, maxDim, quality) {
    let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const longSide = Math.max(w, h);
    if (longSide > maxDim) {
      const scale = maxDim / longSide;
      w = Math.round(w * scale); h = Math.round(h * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return _canvasToBlob(canvas, 'image/jpeg', quality);
  }

  // ファイル(File/Blob)から サムネイル＋フル解像度 の2つのBlobを生成する
  // opts: {thumbDim=400, thumbQuality=0.6, fullDim=1600, fullQuality=0.8}
  function compressImageToBlobs(file, opts) {
    opts = opts || {};
    const thumbDim = opts.thumbDim || 400, thumbQuality = opts.thumbQuality || 0.6;
    const fullDim = opts.fullDim || 1600, fullQuality = opts.fullQuality || 0.8;
    return new Promise((resolve, reject) => {
      if (!file || !file.type || !file.type.startsWith('image/')) {
        // 画像以外(PDF等)は圧縮せずファイル自体をBlobとして扱う
        resolve({ thumbBlob: file, fullBlob: file, isPdf: true });
        return;
      }
      const r = new FileReader();
      r.onload = ev => {
        const img = new Image();
        img.onload = () => {
          Promise.all([
            drawToCanvasBlob(img, fullDim, fullQuality),
            drawToCanvasBlob(img, thumbDim, thumbQuality)
          ]).then(([fullBlob, thumbBlob]) => resolve({ thumbBlob, fullBlob }))
            .catch(reject);
        };
        img.onerror = () => reject(new Error('画像のデコードに失敗しました'));
        img.src = ev.target.result;
      };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  // 既存のBlobを指定サイズへ再エンコード（印刷品質モードの出し分け等に使用）
  function resizeBlobToBlob(sourceBlob, maxDim, quality) {
    return new Promise((resolve, reject) => {
      if (!sourceBlob || !sourceBlob.type || !sourceBlob.type.startsWith('image/')) {
        resolve(sourceBlob); // PDF等はそのまま
        return;
      }
      const url = trackObjectURL(global.URL.createObjectURL(sourceBlob));
      const img = new Image();
      img.onload = () => {
        drawToCanvasBlob(img, maxDim, quality).then(blob => { revokeObjectURL(url); resolve(blob); }).catch(e => { revokeObjectURL(url); reject(e); });
      };
      img.onerror = () => { revokeObjectURL(url); reject(new Error('画像のデコードに失敗しました')); };
      img.src = url;
    });
  }

  // ===== 遅延読み込み(Lazy Loading) =====
  let _lazyObserver = null;
  function _getLazyObserver() {
    if (_lazyObserver) return _lazyObserver;
    if (!('IntersectionObserver' in global)) return null;
    _lazyObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          loadLazyPhoto(entry.target);
          _lazyObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '300px' });
    return _lazyObserver;
  }
  // el.dataset.photoKey にIndexedDBのキーをセットしてから呼び出す
  function observeLazyPhoto(el) {
    const obs = _getLazyObserver();
    if (!obs) { loadLazyPhoto(el); return; } // 未対応環境は即読込
    obs.observe(el);
  }
  function loadLazyPhoto(el) {
    const key = el.dataset.photoKey;
    if (!key) return Promise.resolve();
    return idbGet(key).then(blob => {
      if (!blob) return;
      const url = trackObjectURL(global.URL.createObjectURL(blob));
      if (el.dataset.objectUrl) revokeObjectURL(el.dataset.objectUrl);
      el.setAttribute('src', url);
      el.dataset.objectUrl = url;
    }).catch(() => {});
  }

  // ===== 印刷品質モード =====
  // quality: 'light'(軽量/800px/0.6) | 'standard'(標準/1200px/0.7) | 'high'(高画質/1600px/0.85)
  const QUALITY_PRESETS = {
    light:    { maxDim: 800,  quality: 0.6,  label: '軽量（800px・現場確認向け）' },
    standard: { maxDim: 1200, quality: 0.72, label: '標準（1200px・通常の報告書向け）' },
    high:     { maxDim: 1600, quality: 0.85, label: '高画質（1600px・提出用/印刷向け）' }
  };

  // 印刷直前に、[data-photo-key-full]を持つ要素をまとめて指定品質へ差し替える。
  // 差し替え前の状態は data-print-swap-url / data-print-full-url に退避され、
  // restorePrintQuality() で元に戻せる。
  function applyPrintQuality(targets, qualityKey) {
    const preset = QUALITY_PRESETS[qualityKey] || QUALITY_PRESETS.standard;
    return Promise.all(targets.map(el => {
      const fullKey = el.dataset.photoKeyFull;
      if (!fullKey) return Promise.resolve();
      return idbGet(fullKey).then(fullBlob => {
        if (!fullBlob) return;
        return resizeBlobToBlob(fullBlob, preset.maxDim, preset.quality).then(blob => {
          const url = trackObjectURL(global.URL.createObjectURL(blob));
          el.dataset.printSwapUrl = el.getAttribute('src') || '';
          el.dataset.printFullUrl = url;
          el.setAttribute('src', url);
        });
      }).catch(() => {});
    }));
  }
  function restorePrintQuality() {
    document.querySelectorAll('[data-print-full-url]').forEach(el => {
      revokeObjectURL(el.dataset.printFullUrl);
      el.setAttribute('src', el.dataset.printSwapUrl || '');
      delete el.dataset.printFullUrl;
      delete el.dataset.printSwapUrl;
    });
  }

  function estimateSizeLabel(count, qualityKey) {
    const preset = QUALITY_PRESETS[qualityKey] || QUALITY_PRESETS.standard;
    // 大まかな目安（実測ではなく体感上の目安値）
    const approxKBPerPhoto = Math.round((preset.maxDim / 1600) * (preset.quality / 0.85) * 250);
    const totalMB = (count * approxKBPerPhoto / 1024).toFixed(1);
    return `約${totalMB}MB相当（${count}枚 × ${preset.label}）`;
  }

  global.MediaManager = {
    idbPut, idbGet, idbDelete, idbDeleteByPrefix,
    trackObjectURL, revokeObjectURL,
    compressImageToBlobs, resizeBlobToBlob, drawToCanvasBlob,
    observeLazyPhoto, loadLazyPhoto,
    QUALITY_PRESETS, applyPrintQuality, restorePrintQuality, estimateSizeLabel
  };
})(window);
