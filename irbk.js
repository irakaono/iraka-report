/* =============================================================================
 * 甍AI Field  Ver.2.0  —  js/report-bridge.js
 * -----------------------------------------------------------------------------
 * Ver.1 雨漏り調査報告書（index.html）を、コード非破壊のまま案件配下へ接続する橋渡し。
 *
 *  方針:
 *    - Ver.1 の実装は 1 行も書き換えない。末尾に <script> を足すだけで動く。
 *    - URL に ?projectId=proj_xxxx が付いているときだけ有効化。
 *      付いていなければ完全に素通り（Ver.1 は今まで通り localStorage 単体で動作）。
 *    - Ver.1 の保存経路（saveDraftById → setDrafts）を薄くラップし、保存の裏で
 *      IrakaReport（reports ストア）にも同じ内容をミラー保存する。
 *    - 写真本体（バイナリ）は Ver.1 が別 IndexedDB(MediaManager) に持っており、
 *      下書き data にはバイナリが含まれない。念のため dataURL 除去の安全網も入れる。
 *
 *  読み込み順（index.html 末尾、Ver.1 の inline <script> の後）:
 *    <script src="./js/config.js"></script>
 *    <script src="./js/db.js"></script>
 *    <script src="./js/project-api.js"></script>
 *    <script src="./js/report-api.js"></script>
 *    <script src="./js/report-bridge.js"></script>
 *
 *  グローバル公開: window.IrakaBridge
 * ========================================================================== */
(function (root) {
  'use strict';

  function queryParam(name) {
    try {
      var s = (root.location && root.location.search) || '';
      var m = new RegExp('[?&]' + name + '=([^&]*)').exec(s);
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { return null; }
  }

  var PROJECT_ID = queryParam('projectId');
  var IR = root.IrakaReport;
  var IP = root.IrakaProject;
  var IDB = root.IrakaDB;

  // ?projectId が無い / report-api 未ロード なら何もしない（Ver.1 を素通り）
  if (!PROJECT_ID || !IR) { return; }

  var REPORT_TYPE = 'amamori';       // このページは雨漏り調査報告書
  var REPORT_SCHEMA_VERSION = 2;     // Ver.2 帳票レコードのスキーマ
  var MAP_KEY = 'bridge:v1ReportMap';

  var map = {};            // key: "<projectId>|<v1DraftId>" -> reportId
  var mapLoaded = false;

  function loadMap() {
    if (mapLoaded) return Promise.resolve();
    if (!IDB) { mapLoaded = true; return Promise.resolve(); }
    return IDB.get('settings', MAP_KEY).then(function (rec) {
      if (rec && rec.value && typeof rec.value === 'object') map = rec.value;
      mapLoaded = true;
    }).catch(function () { mapLoaded = true; });
  }
  function persistMap() {
    if (!IDB) return;
    IDB.put('settings', { key: MAP_KEY, value: map }).catch(function () {});
  }
  function mkey(v1id) { return PROJECT_ID + '|' + v1id; }

  // dataURL(base64画像) が万一混ざっていても report-api に弾かれないよう除去する安全網。
  function stripDataUrls(v) {
    if (typeof v === 'string') {
      return v.replace(/data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/gi, '[image-removed]');
    }
    if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) v[i] = stripDataUrls(v[i]); return v; }
    if (v && typeof v === 'object') { for (var k in v) if (v.hasOwnProperty(k)) v[k] = stripDataUrls(v[k]); return v; }
    return v;
  }
  function clonePlain(o) { try { return JSON.parse(JSON.stringify(o)); } catch (e) { return {}; } }
  function countPhotos(data) {
    var imgs = (data && data.images) || [];
    var n = 0;
    for (var i = 0; i < imgs.length; i++) { if (imgs[i] && imgs[i].photoRef) n++; }
    return n;
  }
  function status(msg, isErr) {
    if (typeof root.showStatus === 'function') { try { root.showStatus(msg, isErr); } catch (e) {} }
  }

  function doSync(draft) {
    if (!draft || !draft.id) return Promise.resolve();
    var data = stripDataUrls(clonePlain(draft.data || {}));
    var meta = {
      photoCount: countPhotos(draft.data || {}),
      completed: false,
      v1DraftId: draft.id,
      source: 'v1-amamori'
    };
    var k = mkey(draft.id);
    var repId = map[k];

    function createNew() {
      return IR.create({
        projectId: PROJECT_ID,
        type: REPORT_TYPE,
        schemaVersion: REPORT_SCHEMA_VERSION,
        title: draft.name || '雨漏り調査報告書',
        data: data,
        metadata: meta
      }).then(function (rep) {
        map[k] = rep.id; persistMap();
        status('✓ 案件に保存しました');
        return rep;
      }).catch(function (e) {
        status('案件への保存に失敗: ' + (e && e.message ? e.message : e), true);
      });
    }

    if (repId) {
      return IR.update(repId, { title: draft.name, data: data, metadata: meta })
        .then(function (rep) { status('✓ 案件を更新しました'); return rep; })
        .catch(function () { delete map[k]; return createNew(); }); // 消えていた等 → 作り直す
    }
    return createNew();
  }

  function sync(draft) {
    return loadMap().then(function () { return doSync(draft); });
  }

  /* ---- Ver.1 のセーブ経路にフック（最小差分・非破壊） ------------------- */
  var pendingId = null;

  var origSave = root.saveDraftById;
  if (typeof origSave === 'function') {
    root.saveDraftById = function (id, name) {
      pendingId = id;            // どの下書きが保存されるかを控える
      return origSave.apply(this, arguments);
    };
  }

  var origSet = root.setDrafts;
  if (typeof origSet === 'function') {
    root.setDrafts = function (d) {
      var ok = origSet.apply(this, arguments);   // 先に Ver.1 の localStorage 保存
      try {
        if (ok !== false && pendingId && d && d[pendingId]) {
          sync(d[pendingId]);                    // 裏で案件配下へミラー
          pendingId = null;
        }
      } catch (e) {}
      return ok;
    };
  }

  var origDel = root.deleteDraft;
  if (typeof origDel === 'function') {
    root.deleteDraft = function (id) {
      var r = origDel.apply(this, arguments);     // 先に Ver.1 の削除
      try {
        loadMap().then(function () {
          var k = mkey(id); var repId = map[k];
          if (repId) { IR.remove(repId).catch(function () {}); delete map[k]; persistMap(); }
        });
      } catch (e) {}
      return r;
    };
  }

  /* ---- 起動時: マップ読込 + 案件名の案内 -------------------------------- */
  loadMap().then(function () {
    if (IP && typeof IP.get === 'function') {
      IP.get(PROJECT_ID).then(function (p) {
        if (p) status('この報告書は案件「' + p.name + '」に紐づいています');
        else status('案件が見つかりません（' + PROJECT_ID + '）。保存は Ver.1 のみ有効です。', true);
      }).catch(function () {});
    }
  });

  root.IrakaBridge = {
    projectId: PROJECT_ID,
    sync: sync,
    _map: function () { return map; }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.IrakaBridge;

})(typeof window !== 'undefined' ? window
   : typeof globalThis !== 'undefined' ? globalThis
   : this);
