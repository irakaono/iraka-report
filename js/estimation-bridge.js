/* =============================================================================
 * 甍AI Field  Ver.2.0  —  js/estimation-bridge.js
 * -----------------------------------------------------------------------------
 * Estimation Engine（estimation.html）を、案件配下へ接続する橋渡し（report-bridge の積算版）。
 *
 *  方針（report-bridge と同じ規律）:
 *    - Engine 本体（TypeScript/React の純ランタイム）は 1 行も書き換えない。
 *      Engine は起動時に window.IrakaEstimationHost.loadModel() を読み、保存時に saveModel(json) を呼ぶだけ。
 *    - URL に ?projectId=proj_xxxx が付いているときだけ有効化。無ければ何もしない
 *      （Engine は standalone として従来どおりファイル保存/開くで動く）。
 *    - 保存するのは Model（幾何＋属性）だけ ＝ persistence.ts の serializeDocument が出す JSON をそのまま格納。
 *      数量/見積/工程/CO₂ 等の派生は保存しない（Evidence First）。
 *    - 案件⇄積算は 1:1（現行）。project.extensions.estimationRef に積算レコード id を保持。
 *
 *  読み込み順（estimation.html <head>、Engine module より前）:
 *    <script src="js/config.js"></script>
 *    <script src="js/db.js"></script>
 *    <script src="js/project-api.js"></script>
 *    <script src="js/estimation-bridge.js"></script>
 *
 *  依存: window.IrakaDB（estimations ストア／DB v4）・window.IrakaProject。
 *  グローバル公開: window.IrakaEstimation（API層）/ window.IrakaEstimationHost（Engine が読むホスト）
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
  var IDB = root.IrakaDB;
  var IP = root.IrakaProject;
  var STORE = 'estimations';
  var SCHEMA_VERSION = 1;
  var TYPE = 'roof'; // 現行 Engine は屋根＋雨樋

  /* ---- 低レベル：estimations ストア API（?projectId 非依存で使える） -------- */
  function loadByProject(projectId) {
    if (!IDB || !IP || !projectId) return Promise.resolve(null);
    return IP.get(projectId).then(function (p) {
      var ref = p && p.extensions && p.extensions.estimationRef;
      if (ref) {
        return IDB.get(STORE, ref).then(function (rec) {
          if (rec && rec.projectId === projectId) return rec;
          // ref が壊れている場合は projectId インデックスで拾い直す
          return latestByProjectId(projectId);
        });
      }
      return latestByProjectId(projectId);
    });
  }
  function latestByProjectId(projectId) {
    return IDB.query(STORE, 'projectId', projectId).then(function (rows) {
      rows = rows || [];
      rows.sort(function (a, b) { return (a.updatedAt || '') < (b.updatedAt || '') ? 1 : -1; });
      return rows[0] || null;
    });
  }

  function saveForProject(projectId, modelJson, meta) {
    if (!IDB || !IP || !projectId) return Promise.reject(new Error('IrakaDB/IrakaProject/projectId が必要です'));
    if (typeof modelJson !== 'string') modelJson = JSON.stringify(modelJson);
    return IP.get(projectId).then(function (p) {
      if (!p) throw new Error('案件が見つかりません: ' + projectId);
      var ref = p.extensions && p.extensions.estimationRef;
      var now = IDB.nowISO();
      var find = ref ? IDB.get(STORE, ref) : Promise.resolve(null);
      return find.then(function (existing) {
        var rec = existing && existing.projectId === projectId ? existing : {
          id: IDB.genId('est'),
          projectId: projectId,
          schemaVersion: SCHEMA_VERSION,
          type: TYPE,
          createdAt: now
        };
        rec.model = modelJson;                         // ★保存は Model(JSON) だけ
        rec.metadata = (meta && typeof meta === 'object') ? meta : (rec.metadata || {});
        rec.updatedAt = now;
        return IDB.put(STORE, rec).then(function () {
          // 案件に estimationRef を張る（extensions は project-api が浅くマージ）
          if (!ref || ref !== rec.id) {
            return IP.update(projectId, { extensions: { estimationRef: rec.id } }).then(function () { return rec; });
          }
          return rec;
        });
      });
    });
  }

  var IrakaEstimation = {
    STORE: STORE,
    loadByProject: loadByProject,
    saveForProject: saveForProject,
    removeForProject: function (projectId) {
      return loadByProject(projectId).then(function (rec) {
        if (!rec) return null;
        return IDB.remove(STORE, rec.id).then(function () {
          return IP.update(projectId, { extensions: { estimationRef: null } });
        });
      });
    }
  };
  root.IrakaEstimation = IrakaEstimation;

  /* ---- Engine 向けホスト（?projectId が有るときだけ公開） ------------------ */
  if (PROJECT_ID && IDB && IP) {
    root.IrakaEstimationHost = {
      projectId: PROJECT_ID,
      // Engine 起動時：案件の Model(JSON文字列) を返す。無ければ null（＝新規）。
      loadModel: function () {
        return loadByProject(PROJECT_ID).then(function (rec) { return rec ? rec.model : null; });
      },
      // Engine 保存時：Model(JSON文字列) を案件配下へ保存。
      saveModel: function (json) {
        return saveForProject(PROJECT_ID, json).then(function () { return; });
      }
    };
    // 案件名の案内（任意）
    if (IP.get) {
      IP.get(PROJECT_ID).then(function (p) {
        if (root.console) root.console.log('[estimation-bridge] 案件「' + (p && p.name) + '」に接続 (' + PROJECT_ID + ')');
      }).catch(function () {});
    }
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = IrakaEstimation;

})(typeof window !== 'undefined' ? window
   : typeof globalThis !== 'undefined' ? globalThis
   : this);
