/* =============================================================================
 * 甍AI Field  Ver.2.0  —  js/recovery-core.js
 * -----------------------------------------------------------------------------
 * IrakaRecovery : データ安全（診断 / バックアップ / 検証 / 復元）の中核ロジック。
 *   - DOM に依存しない（recovery.html の UI から呼ぶ）。
 *   - Ver.2 の最優先要件「絶対に失わない」を担う。
 *   - 破壊的操作（削除）は自動では行わない。UI からの明示操作のみ。
 *
 *  依存: js/db.js（必須）, js/irbk.js（.irbk 用・任意）
 *  グローバル公開: window.IrakaRecovery
 * ========================================================================== */
(function (root) {
  'use strict';

  var DB = root.IrakaDB || (typeof require !== 'undefined' ? require('./db.js') : null);
  var IRBK = root.IrakaIrbk || (typeof require !== 'undefined' ? require('./irbk.js') : null);
  var IRAKA_DB_NAME = (DB && DB.DB_NAME) || 'irakafieldDB';
  var IRAKA_STORES = (DB && DB.STORES) || ['projects', 'reports', 'photos', 'settings'];

  function idb() { return root.indexedDB || (typeof indexedDB !== 'undefined' ? indexedDB : null); }
  function ls() { try { return root.localStorage || (typeof localStorage !== 'undefined' ? localStorage : null); } catch (e) { return null; } }
  function utf8(s) { return IRBK ? IRBK.utf8(s) : new TextEncoder().encode(s); }
  function fromUtf8(b) { return IRBK ? IRBK.fromUtf8(b) : new TextDecoder().decode(b); }

  /* ---- Blob 変換 -------------------------------------------------------- */
  function isBlob(v) {
    if (typeof Blob !== 'undefined' && v instanceof Blob) return true;
    return !!(v && typeof v === 'object' && typeof v.arrayBuffer === 'function' && typeof v.size === 'number' && typeof v.type === 'string');
  }
  function blobToDataURL(blob) {
    return new Promise(function (resolve) {
      try { var fr = new FileReader(); fr.onload = function () { resolve(fr.result); }; fr.onerror = function () { resolve(null); }; fr.readAsDataURL(blob); }
      catch (e) { resolve(null); }
    });
  }
  function blobBytes(blob) {
    if (blob.arrayBuffer) return blob.arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
    return new Promise(function (resolve) {
      try { var fr = new FileReader(); fr.onload = function () { resolve(new Uint8Array(fr.result)); }; fr.onerror = function () { resolve(new Uint8Array(0)); }; fr.readAsArrayBuffer(blob); }
      catch (e) { resolve(new Uint8Array(0)); }
    });
  }
  function dataURLToBlob(dataURL) {
    try {
      var parts = dataURL.split(','), mime = (parts[0].match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
      var bin = atob(parts[1]), arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return new Blob([arr], { type: mime });
    } catch (e) { return null; }
  }
  function serializeValue(v, includeBlobs) {
    if (isBlob(v)) {
      if (!includeBlobs) return Promise.resolve({ __blob: true, type: v.type, size: v.size, omitted: true });
      return blobToDataURL(v).then(function (d) { return { __blob: true, type: v.type, size: v.size, dataURL: d }; });
    }
    if (Array.isArray(v)) {
      return v.reduce(function (ch, item) { return ch.then(function (acc) { return serializeValue(item, includeBlobs).then(function (x) { acc.push(x); return acc; }); }); }, Promise.resolve([]));
    }
    if (v && typeof v === 'object') {
      var keys = Object.keys(v);
      return keys.reduce(function (ch, k) { return ch.then(function (acc) { return serializeValue(v[k], includeBlobs).then(function (x) { acc[k] = x; return acc; }); }); }, Promise.resolve({}));
    }
    return Promise.resolve(v);
  }
  function reviveValue(v) {
    if (v && v.__blob === true) { if (v.dataURL) { var b = dataURLToBlob(v.dataURL); if (b) return b; } return v; }
    if (Array.isArray(v)) return v.map(reviveValue);
    if (v && typeof v === 'object') { var o = {}; Object.keys(v).forEach(function (k) { o[k] = reviveValue(v[k]); }); return o; }
    return v;
  }
  // .irbk 用: __blob.file を map から Blob 復元（再帰）
  function reviveBlobs(v, map, counter) {
    if (v && v.__blob === true) {
      if (v.file && map[v.file] && typeof Blob !== 'undefined') { if (counter) counter.n++; return new Blob([map[v.file]], { type: v.type }); }
      if (v.dataURL) { var b = dataURLToBlob(v.dataURL); if (b) { if (counter) counter.n++; return b; } }
      return v;
    }
    if (Array.isArray(v)) return v.map(function (x) { return reviveBlobs(x, map, counter); });
    if (v && typeof v === 'object') { var o = {}; Object.keys(v).forEach(function (k) { o[k] = reviveBlobs(v[k], map, counter); }); return o; }
    return v;
  }
  // .irbk 用: 値の中の Blob を再帰抽出し files に退避、参照へ差し替え
  function extractBlobs(v, files, ctx) {
    if (isBlob(v)) {
      if (!ctx.includeMedia) return Promise.resolve({ __blob: true, type: v.type, size: v.size, omitted: true });
      var path = 'media/' + ctx.dbName + '/' + (ctx.n.n++) + '.bin';
      return blobBytes(v).then(function (bytes) { files.push({ name: path, data: bytes }); return { __blob: true, type: v.type, size: v.size, file: path }; });
    }
    if (Array.isArray(v)) {
      return v.reduce(function (ch, item) { return ch.then(function (acc) { return extractBlobs(item, files, ctx).then(function (x) { acc.push(x); return acc; }); }); }, Promise.resolve([]));
    }
    if (v && typeof v === 'object') {
      var keys = Object.keys(v);
      return keys.reduce(function (ch, k) { return ch.then(function (acc) { return extractBlobs(v[k], files, ctx).then(function (x) { acc[k] = x; return acc; }); }); }, Promise.resolve({}));
    }
    return Promise.resolve(v);
  }

  /* ---- IndexedDB 列挙・ダンプ ------------------------------------------- */
  function listDatabases() {
    var I = idb();
    if (I && I.databases) {
      return I.databases().then(function (list) {
        return (list || []).filter(function (d) { return d && d.name; }).map(function (d) { return { name: d.name, version: d.version || null }; });
      }).catch(function () { return [{ name: IRAKA_DB_NAME, version: null }]; });
    }
    return Promise.resolve([{ name: IRAKA_DB_NAME, version: null }]);
  }

  // 値をシリアライズ（dataURL 化）してダンプ（JSON バックアップ用）
  function dumpDB(name, includeBlobs) {
    var I = idb();
    return new Promise(function (resolve) {
      if (!I) { resolve({ name: name, stores: {} }); return; }
      var req = I.open(name);
      req.onsuccess = function () {
        var db = req.result, storeNames = Array.prototype.slice.call(db.objectStoreNames);
        if (!storeNames.length) { db.close(); resolve({ name: name, version: db.version, stores: {} }); return; }
        var out = { name: name, version: db.version, stores: {} };
        var tx = db.transaction(storeNames, 'readonly'), pending = storeNames.length;
        storeNames.forEach(function (sn) {
          var arr = [], cur = tx.objectStore(sn).openCursor();
          cur.onsuccess = function (e) {
            var c = e.target.result;
            if (c) { serializeValue(c.value, includeBlobs).then(function (val) { arr.push({ key: c.key, value: val }); c.continue(); }); }
            else { out.stores[sn] = arr; if (--pending === 0) { db.close(); resolve(out); } }
          };
          cur.onerror = function () { out.stores[sn] = arr; if (--pending === 0) { db.close(); resolve(out); } };
        });
      };
      req.onerror = function () { resolve({ name: name, stores: {}, error: true }); };
    });
  }

  // 値をそのまま（Blob を保持したまま）ダンプ（.irbk 用）
  function rawDumpDB(name) {
    var I = idb();
    return new Promise(function (resolve) {
      if (!I) { resolve({ stores: {} }); return; }
      var req = I.open(name);
      req.onsuccess = function () {
        var db = req.result, storeNames = Array.prototype.slice.call(db.objectStoreNames);
        if (!storeNames.length) { db.close(); resolve({ stores: {} }); return; }
        var out = { stores: {} }, tx = db.transaction(storeNames, 'readonly'), pending = storeNames.length;
        storeNames.forEach(function (sn) {
          var arr = [], cur = tx.objectStore(sn).openCursor();
          cur.onsuccess = function (e) { var c = e.target.result; if (c) { arr.push({ key: c.key, value: c.value }); c.continue(); } else { out.stores[sn] = arr; if (--pending === 0) { db.close(); resolve(out); } } };
          cur.onerror = function () { out.stores[sn] = arr; if (--pending === 0) { db.close(); resolve(out); } };
        });
      };
      req.onerror = function () { resolve({ stores: {} }); };
    });
  }

  /* ---- 診断 ------------------------------------------------------------- */
  function readLocalStorage() {
    var L = ls(), out = {};
    if (!L) return out;
    try { for (var i = 0; i < L.length; i++) { var k = L.key(i); out[k] = L.getItem(k); } } catch (e) {}
    return out;
  }

  function diagnose() {
    var L = readLocalStorage();
    var lsKeys = Object.keys(L).map(function (k) { var v = L[k] || ''; return { key: k, size: v.length, preview: v.slice(0, 60) }; });
    var drafts = { count: 0, names: [] };
    try {
      var raw = L['iraka_report_drafts_v1'];
      if (raw) { var d = JSON.parse(raw); var keys = Object.keys(d || {}); drafts.count = keys.length; drafts.names = keys.map(function (id) { return (d[id] && d[id].name) || id; }); }
    } catch (e) {}
    return listDatabases().then(function (dbs) {
      return Promise.all(dbs.map(function (info) {
        return dumpDB(info.name, false).then(function (dump) {
          var stores = Object.keys(dump.stores).map(function (sn) { return { name: sn, count: dump.stores[sn].length }; });
          return { name: info.name, version: info.version || dump.version || null, stores: stores };
        });
      })).then(function (idbInfo) {
        var iraka = {}, target = idbInfo.filter(function (x) { return x.name === IRAKA_DB_NAME; })[0];
        if (target) target.stores.forEach(function (s) { iraka[s.name] = s.count; });
        return { localStorage: lsKeys, drafts: drafts, indexeddb: idbInfo, iraka: iraka };
      });
    });
  }

  /* ---- バックアップ（JSON） --------------------------------------------- */
  function backup(opts) {
    opts = opts || {};
    var includeMedia = !!opts.includeMedia;
    var payload = { app: 'iraka-field', backupVersion: 1, format: 'json', savedAt: new Date().toISOString(), origin: (root.location && root.location.href) || '', localStorage: readLocalStorage(), indexeddb: {} };
    return listDatabases().then(function (dbs) {
      if (opts.dbFilter) dbs = dbs.filter(function (d) { return opts.dbFilter.indexOf(d.name) !== -1; });
      return dbs.reduce(function (chain, info) {
        return chain.then(function () { return dumpDB(info.name, includeMedia).then(function (dump) { payload.indexeddb[info.name] = dump.stores; }); });
      }, Promise.resolve());
    }).then(function () { return payload; });
  }

  /* ---- バックアップ（.irbk / ZIP・写真は media/ に分離） ---------------- */
  function backupIrbkFiles(opts) {
    opts = opts || {};
    var includeMedia = !!opts.includeMedia;
    var manifest = { app: 'iraka-field', backupVersion: 2, format: 'irbk', savedAt: new Date().toISOString(), origin: (root.location && root.location.href) || '', localStorage: readLocalStorage(), indexeddb: {} };
    var files = [], mediaN = { n: 0 };
    return listDatabases().then(function (dbs) {
      if (opts.dbFilter) dbs = dbs.filter(function (d) { return opts.dbFilter.indexOf(d.name) !== -1; });
      return dbs.reduce(function (chain, info) {
        return chain.then(function () {
          return rawDumpDB(info.name).then(function (dump) {
            var storeNames = Object.keys(dump.stores);
            var ctx = { includeMedia: includeMedia, dbName: info.name, n: mediaN };
            return storeNames.reduce(function (ch2, sn) {
              return ch2.then(function () {
                var rows = dump.stores[sn], outRows = [];
                return rows.reduce(function (ch3, row) {
                  return ch3.then(function () {
                    return extractBlobs(row.value, files, ctx).then(function (val) { outRows.push({ key: row.key, value: val }); });
                  });
                }, Promise.resolve()).then(function () {
                  manifest.indexeddb[info.name] = manifest.indexeddb[info.name] || {};
                  manifest.indexeddb[info.name][sn] = outRows;
                });
              });
            }, Promise.resolve());
          });
        });
      }, Promise.resolve());
    }).then(function () {
      files.unshift({ name: 'backup.json', data: utf8(JSON.stringify(manifest)) });
      return files;
    });
  }
  // .irbk（zip 済み Uint8Array）を返す
  function backupIrbk(opts) {
    if (!IRBK) return Promise.reject(new Error('irbk.js が読み込まれていません。'));
    return backupIrbkFiles(opts).then(function (files) { return IRBK.zip(files); });
  }

  /* ---- 汎用DB復元（IRAKA_DB_NAME 以外。例: iraka_media_db の写真） -------
   * media ストア等は out-of-line キー（put(value, key)）。存在しなければ作成する。
   * これが無いと復元時に写真(iraka_media_db)が skipped されて戻らない（不具合修正）。 */
  function restoreGenericDB(dbName, storesObj, reviveFn) {
    var I = idb();
    if (!I || !storesObj) return Promise.resolve(0);
    var storeNames = Object.keys(storesObj);
    if (storeNames.length === 0) return Promise.resolve(0);
    return new Promise(function (resolve) {
      var openReq = I.open(dbName);
      openReq.onupgradeneeded = function () { // DBが存在しない場合: 必要ストアを作成
        var d = openReq.result;
        storeNames.forEach(function (sn) { if (!d.objectStoreNames.contains(sn)) d.createObjectStore(sn); });
      };
      openReq.onsuccess = function () {
        var db = openReq.result;
        var missing = storeNames.filter(function (sn) { return !db.objectStoreNames.contains(sn); });
        if (missing.length === 0) { resolve(db); return; }
        var v = db.version + 1; db.close();
        var up = I.open(dbName, v);
        up.onupgradeneeded = function () { var d = up.result; missing.forEach(function (sn) { if (!d.objectStoreNames.contains(sn)) d.createObjectStore(sn); }); };
        up.onsuccess = function () { resolve(up.result); };
        up.onerror = function () { resolve(null); };
      };
      openReq.onerror = function () { resolve(null); };
    }).then(function (db) {
      if (!db) return 0;
      var count = 0;
      return storeNames.reduce(function (chain, sn) {
        return chain.then(function () {
          if (!db.objectStoreNames.contains(sn)) return;
          var rows = storesObj[sn]; if (!Array.isArray(rows) || rows.length === 0) return;
          return new Promise(function (res) {
            var tx = db.transaction(sn, 'readwrite');
            var store = tx.objectStore(sn);
            rows.forEach(function (row) { try { store.put(reviveFn(row.value), row.key); count++; } catch (e) {} });
            tx.oncomplete = function () { res(); };
            tx.onerror = function () { res(); };
            tx.onabort = function () { res(); };
          });
        });
      }, Promise.resolve()).then(function () { db.close(); return count; });
    });
  }

  /* ---- 復元（JSON payload） -------------------------------------------- */
  function restore(payload, opts) {
    opts = opts || {};
    if (!payload || typeof payload !== 'object') return Promise.reject(new Error('復元データが不正です。'));
    var report = { localStorageKeys: 0, irakaRecords: 0, media: 0, skipped: [] };
    if (opts.restoreLocalStorage !== false && payload.localStorage) {
      var L = ls();
      if (L) Object.keys(payload.localStorage).forEach(function (k) { try { L.setItem(k, payload.localStorage[k]); report.localStorageKeys++; } catch (e) {} });
    }
    var chain = Promise.resolve();
    if (opts.restoreIraka !== false && DB && payload.indexeddb && payload.indexeddb[IRAKA_DB_NAME]) {
      var stores = payload.indexeddb[IRAKA_DB_NAME];
      IRAKA_STORES.forEach(function (sn) {
        var rows = stores[sn]; if (!Array.isArray(rows)) return;
        rows.forEach(function (row) { chain = chain.then(function () { var val = reviveValue(row.value); return DB.put(sn, val).then(function () { report.irakaRecords++; }, function () {}); }); });
      });
    }
    // IRAKA_DB_NAME 以外（iraka_media_db の写真など）も復元する
    if (payload.indexeddb) Object.keys(payload.indexeddb).forEach(function (n) {
      if (n === IRAKA_DB_NAME) return;
      chain = chain.then(function () { return restoreGenericDB(n, payload.indexeddb[n], reviveValue).then(function (c) { report.media += c; }); });
    });
    return chain.then(function () { return report; });
  }

  /* ---- 復元（.irbk / zip 済み bytes） ---------------------------------- */
  function restoreFromIrbk(bytes, opts) {
    opts = opts || {};
    if (!IRBK) return Promise.reject(new Error('irbk.js が読み込まれていません。'));
    var files;
    try { files = IRBK.unzip(bytes); } catch (e) { return Promise.reject(e); }
    var map = {}, manifestText = null;
    files.forEach(function (f) { if (f.name === 'backup.json') manifestText = fromUtf8(f.data); else map[f.name] = f.data; });
    if (!manifestText) return Promise.reject(new Error('backup.json が見つかりません（不正な .irbk）。'));
    var manifest;
    try { manifest = JSON.parse(manifestText); } catch (e) { return Promise.reject(new Error('backup.json の解析に失敗。')); }

    var report = { localStorageKeys: 0, irakaRecords: 0, media: 0, skipped: [] };
    if (opts.restoreLocalStorage !== false && manifest.localStorage) {
      var L = ls();
      if (L) Object.keys(manifest.localStorage).forEach(function (k) { try { L.setItem(k, manifest.localStorage[k]); report.localStorageKeys++; } catch (e) {} });
    }
    var chain = Promise.resolve();
    if (opts.restoreIraka !== false && DB && manifest.indexeddb && manifest.indexeddb[IRAKA_DB_NAME]) {
      var stores = manifest.indexeddb[IRAKA_DB_NAME];
      IRAKA_STORES.forEach(function (sn) {
        var rows = stores[sn]; if (!Array.isArray(rows)) return;
        rows.forEach(function (row) {
          chain = chain.then(function () {
            var counter = { n: 0 };
            var val = reviveBlobs(row.value, map, counter);
            report.media += counter.n;
            return DB.put(sn, val).then(function () { report.irakaRecords++; }, function () {});
          });
        });
      });
    }
    // IRAKA_DB_NAME 以外（iraka_media_db の写真など）も .irbk の実体から復元する
    if (manifest.indexeddb) Object.keys(manifest.indexeddb).forEach(function (n) {
      if (n === IRAKA_DB_NAME) return;
      chain = chain.then(function () {
        return restoreGenericDB(n, manifest.indexeddb[n], function (v) {
          var counter = { n: 0 };
          var out = reviveBlobs(v, map, counter);
          report.media += counter.n;
          return out;
        });
      });
    });
    return chain.then(function () { return report; });
  }

  /* ---- 整合性チェック（読み取り専用） ---------------------------------- */
  function integrity() {
    if (!DB) return Promise.reject(new Error('IrakaDB が読み込まれていません。'));
    return Promise.all([DB.getAll('projects'), DB.getAll('reports'), DB.getAll('photos'), DB.get('settings', 'bridge:v1ReportMap')]).then(function (res) {
      var projects = res[0] || [], reports = res[1] || [], photos = res[2] || [], bridgeRec = res[3];
      var projectIds = {}, reportIds = {};
      projects.forEach(function (p) { projectIds[p.id] = true; });
      reports.forEach(function (r) { reportIds[r.id] = true; });
      var orphanReports = reports.filter(function (r) { return !projectIds[r.projectId]; }).map(function (r) { return { id: r.id, projectId: r.projectId, title: r.title }; });
      var orphanPhotos = photos.filter(function (p) { return (p.reportId && !reportIds[p.reportId]) || (p.projectId && !projectIds[p.projectId]); }).map(function (p) { return { id: p.id, reportId: p.reportId, projectId: p.projectId }; });
      var bridgeDangling = [];
      if (bridgeRec && bridgeRec.value) Object.keys(bridgeRec.value).forEach(function (k) { if (!reportIds[bridgeRec.value[k]]) bridgeDangling.push({ mapKey: k, reportId: bridgeRec.value[k] }); });
      return {
        counts: { projects: projects.length, reports: reports.length, photos: photos.length },
        orphanReports: orphanReports, orphanPhotos: orphanPhotos, bridgeDangling: bridgeDangling,
        healthy: orphanReports.length === 0 && orphanPhotos.length === 0 && bridgeDangling.length === 0
      };
    });
  }

  // 孤立データを CSV 文字列で書き出す（保全・調査用。非破壊）
  function csvEscape(s) { s = String(s == null ? '' : s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function exportOrphansCSV() {
    return integrity().then(function (r) {
      var lines = ['kind,id,title,projectId,reportId'];
      r.orphanReports.forEach(function (x) { lines.push(['report', csvEscape(x.id), csvEscape(x.title || ''), csvEscape(x.projectId || ''), ''].join(',')); });
      r.orphanPhotos.forEach(function (x) { lines.push(['photo', csvEscape(x.id), '', csvEscape(x.projectId || ''), csvEscape(x.reportId || '')].join(',')); });
      return lines.join('\n');
    });
  }

  // 孤立した帳票を、指定した既存案件へ移動する（修復操作）。
  function reassignOrphanReports(targetProjectId) {
    if (!DB) return Promise.reject(new Error('IrakaDB が読み込まれていません。'));
    if (!targetProjectId) return Promise.reject(new Error('移動先の projectId が必要です。'));
    return DB.get('projects', targetProjectId).then(function (p) {
      if (!p) throw new Error('移動先の案件が存在しません: ' + targetProjectId);
      return integrity();
    }).then(function (r) {
      var chain = Promise.resolve(), moved = 0;
      r.orphanReports.forEach(function (o) {
        chain = chain.then(function () {
          return DB.get('reports', o.id).then(function (rep) {
            if (!rep) return;
            rep.projectId = targetProjectId; rep.updatedAt = DB.nowISO();
            return DB.put('reports', rep).then(function () { moved++; });
          });
        });
      });
      return chain.then(function () { return { moved: moved }; });
    });
  }

  // 孤立データを削除（破壊的。UI から明示操作されたときのみ呼ぶ）。
  function deleteOrphans(opts) {
    opts = opts || { reports: true, photos: true };
    return integrity().then(function (rep) {
      var chain = Promise.resolve(), removed = { reports: 0, photos: 0 };
      if (opts.reports !== false) rep.orphanReports.forEach(function (r) { chain = chain.then(function () { return DB.remove('reports', r.id).then(function () { removed.reports++; }, function () {}); }); });
      if (opts.photos !== false) rep.orphanPhotos.forEach(function (p) { chain = chain.then(function () { return DB.remove('photos', p.id).then(function () { removed.photos++; }, function () {}); }); });
      return chain.then(function () { return removed; });
    });
  }

  var IrakaRecovery = {
    listDatabases: listDatabases,
    dumpDB: dumpDB,
    diagnose: diagnose,
    backup: backup,
    backupIrbkFiles: backupIrbkFiles,
    backupIrbk: backupIrbk,
    restore: restore,
    restoreFromIrbk: restoreFromIrbk,
    integrity: integrity,
    exportOrphansCSV: exportOrphansCSV,
    reassignOrphanReports: reassignOrphanReports,
    deleteOrphans: deleteOrphans
  };
  root.IrakaRecovery = IrakaRecovery;
  if (typeof module !== 'undefined' && module.exports) module.exports = IrakaRecovery;

})(typeof window !== 'undefined' ? window
   : typeof globalThis !== 'undefined' ? globalThis
   : this);
