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
  var STORE = 'estimations';                 // current working state（現在編集中の1件・従来どおり）
  var GEOM_STORE = 'geometryRevisions';      // v5: 保存済み形状（不変・追記のみ・原則20）
  var EST_STORE = 'estimationRevisions';     // v5: 積算の履歴 001/002…（原則12/19）
  var SCHEMA_VERSION = 1;
  var REV_SCHEMA_VERSION = 1;
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

  /* ---- 履歴（v5）：Geometry Revision（不変・追記）＋ Estimation Revision（001/002…） ------
   *  憲法 原則12（判断は追記）・19（Projectが器）・20（保存済み形状は不変・Estimationは形状を固定）。
   *  ★current working state（STORE）は従来どおり。履歴は別ストアに「追記のみ」で貯める。
   *  ★過去版を開く＝当時の Geometry Revision の model を読む。数量/見積は Geometry からの決定的 Projection。 */
  function sortBySeq(rows) {
    return (rows || []).slice().sort(function (a, b) { return (a.sequence || 0) - (b.sequence || 0); });
  }
  function listGeometryRevisions(projectId) {
    if (!IDB || !projectId) return Promise.resolve([]);
    return IDB.query(GEOM_STORE, 'projectId', projectId).then(sortBySeq);
  }
  function listEstimationRevisions(projectId) {
    if (!IDB || !projectId) return Promise.resolve([]);
    return IDB.query(EST_STORE, 'projectId', projectId).then(sortBySeq);
  }
  // 過去版を開く：Geometry Revision の model(JSON文字列) を返す（当時の形状を完全再現）。
  function loadGeometryRevision(projectId, geometryRevisionId) {
    if (!IDB || !projectId || !geometryRevisionId) return Promise.resolve(null);
    return IDB.get(GEOM_STORE, geometryRevisionId).then(function (rec) {
      return (rec && rec.projectId === projectId) ? rec.model : null;
    });
  }
  // 履歴に1件追記：形状は直近と同一なら再利用（複製しない）、違えば新 Geometry Revision を追記。
  //   payload: { model(JSON文字列/obj), quantitySnapshot?, quotationSnapshot?, note?, createdBy? }
  function saveEstimationRevision(projectId, payload) {
    if (!IDB || !IP || !projectId) return Promise.reject(new Error('IrakaDB/IrakaProject/projectId が必要です'));
    payload = payload || {};
    var model = payload.model;
    if (typeof model !== 'string') model = JSON.stringify(model);
    if (!model) return Promise.reject(new Error('model（Geometry）が必要です'));
    var now = IDB.nowISO();
    return listGeometryRevisions(projectId).then(function (grows) {
      var latest = grows[grows.length - 1] || null;
      var reused = !!(latest && latest.model === model);
      var geomPromise;
      if (reused) {
        geomPromise = Promise.resolve(latest);                 // 同一形状は複製せず参照を使い回す（原則20）
      } else {
        var grec = {
          id: IDB.genId('grev'), projectId: projectId, sequence: (latest ? latest.sequence : 0) + 1,
          schemaVersion: REV_SCHEMA_VERSION, createdAt: now, model: model
        };
        geomPromise = IDB.put(GEOM_STORE, grec).then(function () { return grec; });
      }
      return geomPromise.then(function (geom) {
        return listEstimationRevisions(projectId).then(function (erows) {
          var eseq = (erows[erows.length - 1] ? erows[erows.length - 1].sequence : 0) + 1;
          var erec = {
            id: IDB.genId('erev'), projectId: projectId, sequence: eseq,
            schemaVersion: REV_SCHEMA_VERSION, createdAt: now, createdBy: payload.createdBy || null,
            geometryRevisionId: geom.id, geometrySequence: geom.sequence,       // ★形状を固定（pin）
            quantitySnapshot: (payload.quantitySnapshot != null) ? payload.quantitySnapshot : null,  // 監査・再現確認用
            quotationSnapshot: (payload.quotationSnapshot != null) ? payload.quotationSnapshot : null,
            status: 'draft', note: payload.note || ''
          };
          return IDB.put(EST_STORE, erec).then(function () {
            // 現在編集中の状態も最新へ（loadModel の一貫性）。旧 estimations レコードは壊さない。
            return saveForProject(projectId, model).then(
              function () { return { estimation: erec, geometry: geom, geometryReused: reused }; },
              function () { return { estimation: erec, geometry: geom, geometryReused: reused }; }
            );
          });
        });
      });
    });
  }
  // 採用版の判断（EstimationDecision）は Project 側に持つ（原則19・Phase A#2 の受け皿）。今は read/write のみ。
  function getEstimationDecision(projectId) {
    return IP.get(projectId).then(function (p) { return (p && p.extensions && p.extensions.estimationDecision) || null; });
  }
  function setEstimationDecision(projectId, decision) {
    return IP.update(projectId, { extensions: { estimationDecision: decision } }).then(function () { return decision; });
  }

  var IrakaEstimation = {
    STORE: STORE,
    GEOM_STORE: GEOM_STORE,
    EST_STORE: EST_STORE,
    loadByProject: loadByProject,
    saveForProject: saveForProject,
    // v5 履歴 API（現状調査 → 契約LOCK 済み）
    listGeometryRevisions: listGeometryRevisions,
    listEstimationRevisions: listEstimationRevisions,
    loadGeometryRevision: loadGeometryRevision,
    saveEstimationRevision: saveEstimationRevision,
    getEstimationDecision: getEstimationDecision,
    setEstimationDecision: setEstimationDecision,
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
      // Engine 保存時：Model(JSON文字列) を案件配下へ保存（＝現在編集中の状態）。
      saveModel: function (json) {
        return saveForProject(PROJECT_ID, json).then(function () { return; });
      },
      // ── v5 履歴 API（Studio が呼ぶ。無い場合は standalone 扱い＝Studio は履歴UIを出さない） ──
      hasHistory: true,
      listRevisions: function () { return listEstimationRevisions(PROJECT_ID); },
      listGeometryRevisions: function () { return listGeometryRevisions(PROJECT_ID); },
      saveRevision: function (payload) { return saveEstimationRevision(PROJECT_ID, payload); },
      openRevision: function (geometryRevisionId) { return loadGeometryRevision(PROJECT_ID, geometryRevisionId); },
      getDecision: function () { return getEstimationDecision(PROJECT_ID); },
      setDecision: function (d) { return setEstimationDecision(PROJECT_ID, d); }
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
