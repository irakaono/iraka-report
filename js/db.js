/* =============================================================================
 * 甍AI Field  Ver.2.0  —  js/db.js
 * -----------------------------------------------------------------------------
 * IndexedDB 基盤レイヤー（薄い土台）
 *
 *  役割：保存 / 取得 / 削除 / 一覧 / トランザクション のみ。
 *        帳票の「中身」の構造は決めない（各帳票側 / project-api.js に委譲）。
 *
 *  ARCHITECTURE_V2（憲法）確定事項：
 *    - DB名        : irakafieldDB
 *    - DB Version  : 5   （v2: 初期スキーマ / v3: projects.kind / v4: estimations / v5: 履歴2ストア）
 *    - stores      : projects / reports / photos / settings / estimations
 *                    / geometryRevisions / estimationRevisions（v5：積算履歴・原則12/19/20）
 *    - 最上位構造  : 案件 → 帳票 → 写真 → AI
 *    - 原則:
 *        (1) reports に写真本体を持たせない（写真は photos ストアに独立）
 *        (2) 全帳票に schemaVersion を持たせる
 *        (3) projectId で案件と帳票を紐づける
 *        (4) 写真は reportId と projectId に紐づける
 *        (5) Ver.1 下書きの自動移行はしない
 *        (6) 将来拡張は extensions / metadata で受ける
 *        (7) Project を会社で唯一の真実(Single Source of Truth)とする。
 *            全機能（報告/写真/積算/工程/発注…）は案件に属し、案件を中心に集まる。
 *        (8) API は状態を持たない(stateless)。currentProject 等を保持せず、常に projectId を渡す。
 *        (9) Recovery セルフテストが PASS しない限り、新機能はマージしない（品質ゲート）。
 *        (10) Backward Compatibility First — 既存現場を壊さない。移行期間は旧システムと必ず共存する。
 *        (11) SelfTest と Recovery は同じ API(IrakaRecovery)を使う。テスト専用の別実装を作らない。
 *
 *  グローバル公開：window.IrakaDB
 * ========================================================================== */
(function (global) {
  'use strict';

  /* ---- 定数（憲法の固定条件） ------------------------------------------- */
  var DB_NAME = 'irakafieldDB';
  var DB_VERSION = 5;

  // ストア定義。keyPath とインデックスのみを宣言。レコードの中身は縛らない。
  var SCHEMA = {
    projects: {
      keyPath: 'id',
      indexes: [
        { name: 'status',    keyPath: 'status',    options: { unique: false } },
        { name: 'kind',      keyPath: 'kind',      options: { unique: false } },
        { name: 'updatedAt', keyPath: 'updatedAt', options: { unique: false } }
      ]
    },
    reports: {
      keyPath: 'id',
      indexes: [
        { name: 'projectId',     keyPath: 'projectId',     options: { unique: false } },
        { name: 'type',          keyPath: 'type',          options: { unique: false } },
        { name: 'schemaVersion', keyPath: 'schemaVersion', options: { unique: false } },
        { name: 'updatedAt',     keyPath: 'updatedAt',     options: { unique: false } }
      ]
    },
    photos: {
      keyPath: 'id',
      indexes: [
        { name: 'reportId',  keyPath: 'reportId',  options: { unique: false } },
        { name: 'projectId', keyPath: 'projectId', options: { unique: false } },
        { name: 'createdAt', keyPath: 'createdAt', options: { unique: false } }
      ]
    },
    settings: {
      keyPath: 'key',
      indexes: []
    },
    // v4: 積算（案件配下の Model 保存）。中身の構造は縛らない（Evidence First：Model=幾何+属性の JSON）。
    //   ★これは「現在編集中の状態（current working state）」。履歴は下の 2 ストア（v5）で持つ。
    estimations: {
      keyPath: 'id',
      indexes: [
        { name: 'projectId',     keyPath: 'projectId',     options: { unique: false } },
        { name: 'schemaVersion', keyPath: 'schemaVersion', options: { unique: false } },
        { name: 'updatedAt',     keyPath: 'updatedAt',     options: { unique: false } }
      ]
    },
    // v5: Geometry Revision（保存済み形状＝不変・追記のみ／憲法 原則20）。Model=serializeDocument の JSON。
    geometryRevisions: {
      keyPath: 'id',
      indexes: [
        { name: 'projectId', keyPath: 'projectId', options: { unique: false } },
        { name: 'sequence',  keyPath: 'sequence',  options: { unique: false } },
        { name: 'createdAt', keyPath: 'createdAt', options: { unique: false } }
      ]
    },
    // v5: Estimation Revision（積算の履歴 001/002…／憲法 原則12・19）。geometryRevisionId で形状を固定（pin）。
    estimationRevisions: {
      keyPath: 'id',
      indexes: [
        { name: 'projectId',          keyPath: 'projectId',          options: { unique: false } },
        { name: 'sequence',           keyPath: 'sequence',           options: { unique: false } },
        { name: 'geometryRevisionId', keyPath: 'geometryRevisionId', options: { unique: false } },
        { name: 'createdAt',          keyPath: 'createdAt',          options: { unique: false } }
      ]
    }
  };

  var STORE_NAMES = Object.keys(SCHEMA);

  /* ---- スキーマ適用（冪等） --------------------------------------------- */
  function applySchema(db, tx) {
    STORE_NAMES.forEach(function (storeName) {
      var def = SCHEMA[storeName];
      var store;
      if (!db.objectStoreNames.contains(storeName)) {
        store = db.createObjectStore(storeName, { keyPath: def.keyPath });
      } else {
        store = tx.objectStore(storeName);
      }
      def.indexes.forEach(function (idx) {
        if (!store.indexNames.contains(idx.name)) {
          store.createIndex(idx.name, idx.keyPath, idx.options);
        }
      });
    });
  }

  /* ---- マイグレーション登録簿 -------------------------------------------
   * キー = 到達バージョン。各関数は (db, tx, ctx) を受け取り、
   * そのバージョンへ上げるための構造変更の差分だけを行う。
   *   - 憲法(5): 既存レコードの中身は変換しない（構造＝ストア/インデックスのみ）。
   *   - onupgradeneeded では oldVersion+1 … newVersion を順に適用する。
   *   - 将来 Ver.4 以降は 4:, 5: を足すだけ（既存は書き換えない）。
   *   - 外部ファイルから IrakaDB.registerMigration(4, fn) で追加登録も可能。
   * --------------------------------------------------------------------- */
  var MIGRATIONS = {
    // v2: 初期スキーマ（projects/reports/photos/settings）
    2: function (db, tx) { applySchema(db, tx); },

    // v3: projects に kind インデックスを追加（構造のみ・データ変換なし）
    3: function (db, tx) {
      var projects = db.objectStoreNames.contains('projects')
        ? tx.objectStore('projects')
        : db.createObjectStore('projects', { keyPath: 'id' });
      if (!projects.indexNames.contains('kind')) {
        projects.createIndex('kind', 'kind', { unique: false });
      }
    },

    // v4: estimations ストア追加（積算＝案件配下の Model 保存。構造のみ・既存データは触らない）
    4: function (db, tx) {
      var est = db.objectStoreNames.contains('estimations')
        ? tx.objectStore('estimations')
        : db.createObjectStore('estimations', { keyPath: 'id' });
      ['projectId', 'schemaVersion', 'updatedAt'].forEach(function (name) {
        if (!est.indexNames.contains(name)) est.createIndex(name, name, { unique: false });
      });
    },

    // v5: 履歴用ストア追加（geometryRevisions / estimationRevisions）。構造のみ・既存データは一切触らない。
    //     憲法 原則5/10：旧データ（estimations の current working state）は不変。履歴は新ストアに追記する。
    5: function (db, tx) {
      var gr = db.objectStoreNames.contains('geometryRevisions')
        ? tx.objectStore('geometryRevisions')
        : db.createObjectStore('geometryRevisions', { keyPath: 'id' });
      ['projectId', 'sequence', 'createdAt'].forEach(function (name) {
        if (!gr.indexNames.contains(name)) gr.createIndex(name, name, { unique: false });
      });
      var er = db.objectStoreNames.contains('estimationRevisions')
        ? tx.objectStore('estimationRevisions')
        : db.createObjectStore('estimationRevisions', { keyPath: 'id' });
      ['projectId', 'sequence', 'geometryRevisionId', 'createdAt'].forEach(function (name) {
        if (!er.indexNames.contains(name)) er.createIndex(name, name, { unique: false });
      });
    }
  };

  function registerMigration(version, fn) {
    if (typeof version !== 'number' || typeof fn !== 'function') {
      throw new DBError('registerMigration(version:number, fn:function) が必要です。',
        null, { version: version });
    }
    MIGRATIONS[version] = fn;
  }

  /* ---- エラー型 ---------------------------------------------------------- */
  function DBError(message, cause, context) {
    this.name = 'DBError';
    this.message = message;
    this.cause = cause || null;
    this.context = context || null;
    if (Error.captureStackTrace) Error.captureStackTrace(this, DBError);
  }
  DBError.prototype = Object.create(Error.prototype);
  DBError.prototype.constructor = DBError;

  /* ---- 内部状態 ---------------------------------------------------------- */
  var _dbPromise = null;

  /* ---- ユーティリティ ---------------------------------------------------- */
  function reqToPromise(request, ctx) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () {
        reject(new DBError('IndexedDB request failed', request.error, ctx));
      };
    });
  }

  function txDone(tx, ctx) {
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () { resolve(); };
      tx.onabort = function () {
        reject(new DBError('Transaction aborted', tx.error, ctx));
      };
      tx.onerror = function () {
        reject(new DBError('Transaction error', tx.error, ctx));
      };
    });
  }

  function genId(prefix) {
    prefix = prefix || 'proj';
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var s = '';
    if (global.crypto && global.crypto.getRandomValues) {
      var buf = new Uint8Array(8);
      global.crypto.getRandomValues(buf);
      for (var i = 0; i < 8; i++) s += chars[buf[i] % chars.length];
    } else {
      for (var j = 0; j < 8; j++) s += chars[Math.floor(Math.random() * chars.length)];
    }
    return prefix + '_' + s;
  }

  function nowISO() { return new Date().toISOString(); }

  /* ---- 接続 -------------------------------------------------------------- */
  function open() {
    if (_dbPromise) return _dbPromise;

    _dbPromise = new Promise(function (resolve, reject) {
      if (!global.indexedDB) {
        reject(new DBError('IndexedDB is not supported in this browser', null, { op: 'open' }));
        return;
      }

      var request = global.indexedDB.open(DB_NAME, DB_VERSION);

      // 原則(5): Ver.1 下書きの自動移行はしない。既存データの中身には触れない。
      request.onupgradeneeded = function (event) {
        var db = request.result;
        var tx = event.target.transaction;
        var from = event.oldVersion || 0;
        var to = event.newVersion || DB_VERSION;
        try {
          for (var v = from + 1; v <= to; v++) {
            if (MIGRATIONS[v]) {
              MIGRATIONS[v](db, tx, { from: from, to: to, version: v });
            }
          }
          applySchema(db, tx);
        } catch (e) {
          try { tx.abort(); } catch (_) {}
          reject(new DBError('Schema migration failed', e, { op: 'migrate', from: from, to: to }));
        }
      };

      request.onsuccess = function () {
        var db = request.result;
        db.onversionchange = function () { db.close(); _dbPromise = null; };
        resolve(db);
      };

      request.onerror = function () {
        _dbPromise = null;
        reject(new DBError('Failed to open database', request.error, { op: 'open' }));
      };

      request.onblocked = function () {
        reject(new DBError(
          'Database open blocked. 別のタブが古いバージョンを開いています。すべてのタブを閉じて再読み込みしてください。',
          null, { op: 'open', blocked: true }));
      };
    });

    return _dbPromise;
  }

  function close() {
    if (!_dbPromise) return Promise.resolve();
    return _dbPromise.then(function (db) { db.close(); _dbPromise = null; });
  }

  function deleteDatabase() {
    return close().then(function () {
      return new Promise(function (resolve, reject) {
        var req = global.indexedDB.deleteDatabase(DB_NAME);
        req.onsuccess = function () { resolve(); };
        req.onerror = function () {
          reject(new DBError('Failed to delete database', req.error, { op: 'deleteDatabase' }));
        };
        req.onblocked = function () {
          reject(new DBError('Delete blocked by open connections', null, { op: 'deleteDatabase', blocked: true }));
        };
      });
    });
  }

  /* ---- トランザクション補助 --------------------------------------------- */
  function assertStore(storeName) {
    if (STORE_NAMES.indexOf(storeName) === -1) {
      throw new DBError('Unknown store: ' + storeName, null, { store: storeName });
    }
  }

  function tx(storeNames, mode, fn) {
    var names = Array.isArray(storeNames) ? storeNames : [storeNames];
    names.forEach(assertStore);

    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var transaction;
        try {
          transaction = db.transaction(names, mode || 'readonly');
        } catch (e) {
          reject(new DBError('Failed to start transaction', e, { stores: names, mode: mode }));
          return;
        }

        var stores = {};
        names.forEach(function (n) { stores[n] = transaction.objectStore(n); });

        var result;
        var work;
        try {
          work = Promise.resolve(fn(stores, transaction));
        } catch (e) {
          try { transaction.abort(); } catch (_) {}
          reject(new DBError('Transaction callback threw', e, { stores: names, mode: mode }));
          return;
        }

        work.then(function (r) { result = r; }, function (err) {
          try { transaction.abort(); } catch (_) {}
          reject(err instanceof DBError ? err
            : new DBError('Transaction callback rejected', err, { stores: names, mode: mode }));
        });

        txDone(transaction, { stores: names, mode: mode })
          .then(function () { resolve(result); }, reject);
      });
    });
  }

  /* ---- 汎用 CRUD --------------------------------------------------------- */
  function put(storeName, value) {
    assertStore(storeName);
    return tx(storeName, 'readwrite', function (stores) {
      return reqToPromise(stores[storeName].put(value), { op: 'put', store: storeName })
        .then(function () { return value; });
    });
  }

  function bulkPut(storeName, values) {
    assertStore(storeName);
    if (!Array.isArray(values)) {
      return Promise.reject(new DBError('bulkPut expects an array', null, { store: storeName }));
    }
    return tx(storeName, 'readwrite', function (stores) {
      return Promise.all(values.map(function (v) {
        return reqToPromise(stores[storeName].put(v), { op: 'bulkPut', store: storeName });
      })).then(function () { return values; });
    });
  }

  function get(storeName, key) {
    assertStore(storeName);
    return tx(storeName, 'readonly', function (stores) {
      return reqToPromise(stores[storeName].get(key), { op: 'get', store: storeName, key: key });
    });
  }

  function getAll(storeName) {
    assertStore(storeName);
    return tx(storeName, 'readonly', function (stores) {
      return reqToPromise(stores[storeName].getAll(), { op: 'getAll', store: storeName });
    });
  }

  function remove(storeName, key) {
    assertStore(storeName);
    return tx(storeName, 'readwrite', function (stores) {
      return reqToPromise(stores[storeName].delete(key), { op: 'remove', store: storeName, key: key });
    });
  }

  function count(storeName) {
    assertStore(storeName);
    return tx(storeName, 'readonly', function (stores) {
      return reqToPromise(stores[storeName].count(), { op: 'count', store: storeName });
    });
  }

  function clear(storeName) {
    assertStore(storeName);
    return tx(storeName, 'readwrite', function (stores) {
      return reqToPromise(stores[storeName].clear(), { op: 'clear', store: storeName });
    });
  }

  function query(storeName, indexName, value) {
    assertStore(storeName);
    return tx(storeName, 'readonly', function (stores) {
      var store = stores[storeName];
      if (!store.indexNames.contains(indexName)) {
        return Promise.reject(new DBError('Unknown index: ' + indexName, null, { store: storeName, index: indexName }));
      }
      return reqToPromise(store.index(indexName).getAll(value),
        { op: 'query', store: storeName, index: indexName, value: value });
    });
  }

  /* ---- 案件×帳票×写真 の関連取得ショートカット ------------------------- */
  var rel = {
    reportsByProject: function (projectId) { return query('reports', 'projectId', projectId); },
    photosByReport:   function (reportId)  { return query('photos', 'reportId', reportId); },
    photosByProject:  function (projectId) { return query('photos', 'projectId', projectId); }
  };

  /* ---- 公開 API ---------------------------------------------------------- */
  var IrakaDB = {
    DB_NAME: DB_NAME,
    DB_VERSION: DB_VERSION,
    STORES: STORE_NAMES.slice(),
    DBError: DBError,

    open: open,
    close: close,
    deleteDatabase: deleteDatabase,

    registerMigration: registerMigration,
    MIGRATIONS: MIGRATIONS,

    put: put,
    bulkPut: bulkPut,
    get: get,
    getAll: getAll,
    remove: remove,
    count: count,
    clear: clear,
    query: query,

    tx: tx,
    rel: rel,

    genId: genId,
    nowISO: nowISO
  };

  global.IrakaDB = IrakaDB;
  if (typeof module !== 'undefined' && module.exports) module.exports = IrakaDB;

})(typeof globalThis !== 'undefined' ? globalThis
   : typeof self !== 'undefined' ? self
   : typeof window !== 'undefined' ? window
   : this);
