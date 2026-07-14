/* =============================================================================
 * 甍AI Field  Ver.2.0  —  js/report-api.js
 * -----------------------------------------------------------------------------
 * IrakaReport : 帳票（reports）専用の API 層
 *
 *  責務（これだけ）:
 *    帳票の 作成 / 取得 / 更新 / 削除 / 案件別一覧 / 種別別一覧 / 複製 / 件数。
 *    - data の中身は解釈しない（各帳票側に委譲）。
 *    - 写真（photos）には一切触れない → photo-api へ委譲。
 *    - 案件（projects）の管理はしない。親の存在確認のため読み取るだけ。
 *    - 憲法(1): reports に写真本体（Blob/DataURL/base64）を持たせない → 混入は拒否。
 *
 *  依存: js/db.js（window.IrakaDB）。HTML では db.js を先に読み込むこと。
 *
 *  帳票レコードの最小形:
 *    {
 *      id: "rep_xxxxxxxx",
 *      projectId: "proj_xxxxxxxx",
 *      type: "amamori",            // amamori | completion
 *      title: "雨漏り調査報告書",
 *      schemaVersion: 2,           // 必須（憲法(2)）
 *      data: {},                   // 帳票本体。ここでは中身を解釈しない
 *      sourceReportId: null,       // 複製元（copyFrom で設定）
 *      createdAt: "...",
 *      updatedAt: "...",
 *      metadata: {                 // 一覧表示用の最小メタ（report-api が必ず保証）
 *        pageCount: 0,
 *        photoCount: 0,
 *        completed: false
 *        // ↑ 帳票を開かずに「写真18枚・未完成」等を一覧表示するための情報
 *      }
 *    }
 *
 *  グローバル公開: window.IrakaReport
 * ========================================================================== */
(function (global) {
  'use strict';

  var DB = global.IrakaDB ||
    (typeof require !== 'undefined' ? require('./db.js') : null);
  if (!DB) {
    throw new Error('[report-api] IrakaDB (js/db.js) が読み込まれていません。db.js を先に読み込んでください。');
  }

  var STORE = 'reports';
  var PROJECTS_STORE = 'projects'; // 親の存在確認のための読み取り専用参照

  var TYPE = { AMAMORI: 'amamori', COMPLETION: 'completion' };
  var TYPE_VALUES = [TYPE.AMAMORI, TYPE.COMPLETION];
  var TYPE_TITLE = { amamori: '雨漏り調査報告書', completion: '工事完了報告書' };

  /* ---- バリデーションエラー -------------------------------------------- */
  function ValidationError(message, field) {
    this.name = 'ValidationError';
    this.message = message;
    this.field = field || null;
    if (Error.captureStackTrace) Error.captureStackTrace(this, ValidationError);
  }
  ValidationError.prototype = Object.create(Error.prototype);
  ValidationError.prototype.constructor = ValidationError;

  /* ---- 内部ヘルパ ------------------------------------------------------- */
  function isNonEmptyString(v) { return typeof v === 'string' && v.trim().length > 0; }
  function isValidType(t) { return TYPE_VALUES.indexOf(t) !== -1; }
  function isPositiveInt(n) { return typeof n === 'number' && isFinite(n) && n > 0 && Math.floor(n) === n; }
  function toCount(n) { return (typeof n === 'number' && isFinite(n) && n >= 0) ? Math.floor(n) : 0; }

  // metadata に最小フィールド（pageCount/photoCount/completed）を必ず持たせる。
  // 呼び出し側が渡した値は尊重し、その他のカスタムキーも保持する。
  function normalizeMetadata(meta) {
    var m = (meta && typeof meta === 'object' && !Array.isArray(meta)) ? meta : {};
    var out = {}, k;
    for (k in m) if (m.hasOwnProperty(k)) out[k] = m[k];
    out.pageCount = toCount(out.pageCount);
    out.photoCount = toCount(out.photoCount);
    out.completed = out.completed === true;
    return out;
  }

  // data 内に画像バイナリ / DataURL / 巨大base64 が紛れていないか走査する。
  function findEmbeddedBinary(val, path) {
    if (val == null) return null;
    var t = typeof val;
    if (t === 'string') {
      if (/^data:[^;,]*;base64,/i.test(val)) return path + ' に DataURL(base64) が埋め込まれています';
      if (val.length > 2000 && /^[A-Za-z0-9+/\r\n]+={0,2}$/.test(val)) return path + ' に base64 らしき巨大文字列があります';
      return null;
    }
    if (t !== 'object') return null;
    if (typeof Blob !== 'undefined' && val instanceof Blob) return path + ' に Blob があります';
    if (typeof File !== 'undefined' && val instanceof File) return path + ' に File があります';
    if (typeof ArrayBuffer !== 'undefined' && (val instanceof ArrayBuffer || ArrayBuffer.isView(val))) {
      return path + ' にバイナリ(ArrayBuffer/TypedArray)があります';
    }
    if (Array.isArray(val)) {
      for (var i = 0; i < val.length; i++) {
        var r = findEmbeddedBinary(val[i], path + '[' + i + ']');
        if (r) return r;
      }
      return null;
    }
    for (var k in val) {
      if (val.hasOwnProperty(k)) {
        var r2 = findEmbeddedBinary(val[k], path ? path + '.' + k : k);
        if (r2) return r2;
      }
    }
    return null;
  }

  function assertNoBinary(data) {
    if (data == null) return;
    if (typeof data !== 'object' || Array.isArray(data)) {
      throw new ValidationError('data はオブジェクトである必要があります。', 'data');
    }
    var hit = findEmbeddedBinary(data, 'data');
    if (hit) {
      throw new ValidationError(
        '帳票(reports)に画像本体は保存できません（' + hit + '）。写真は photos ストア（photo-api）へ。', 'data');
    }
  }

  // 親案件の存在確認（projects ストアの読み取りのみ。案件管理はしない）。
  function assertProjectExists(projectId) {
    return DB.get(PROJECTS_STORE, projectId).then(function (p) {
      if (!p) throw new ValidationError('projectId の案件が存在しません: ' + projectId, 'projectId');
      return p;
    });
  }

  function deepClonePlain(obj) {
    return obj == null ? {} : JSON.parse(JSON.stringify(obj));
  }

  function byCreatedAsc(a, b) {
    var av = a && a.createdAt ? a.createdAt : '';
    var bv = b && b.createdAt ? b.createdAt : '';
    return av < bv ? -1 : av > bv ? 1 : 0;
  }

  /* ---- API -------------------------------------------------------------- */

  // 作成。親案件が存在し、type が正しく、schemaVersion が必須。
  function create(input) {
    input = input || {};
    try {
      if (!isNonEmptyString(input.projectId)) throw new ValidationError('projectId は必須です。', 'projectId');
      if (!isValidType(input.type)) throw new ValidationError('type は amamori / completion のみ。', 'type');
      if (!isPositiveInt(input.schemaVersion)) throw new ValidationError('schemaVersion（正の整数）は必須です。', 'schemaVersion');
      assertNoBinary(input.data);
    } catch (e) { return Promise.reject(e); }

    return assertProjectExists(input.projectId).then(function () {
      var ts = DB.nowISO();
      var record = {
        id: isNonEmptyString(input.id) ? input.id : DB.genId('rep'),
        projectId: input.projectId,
        type: input.type,
        title: isNonEmptyString(input.title) ? input.title.trim() : (TYPE_TITLE[input.type] || ''),
        schemaVersion: input.schemaVersion,
        data: (input.data && typeof input.data === 'object' && !Array.isArray(input.data)) ? input.data : {},
        sourceReportId: isNonEmptyString(input.sourceReportId) ? input.sourceReportId : null,
        createdAt: ts,
        updatedAt: ts,
        metadata: normalizeMetadata(input.metadata)
      };
      return DB.put(STORE, record);
    });
  }

  function get(id) {
    if (!isNonEmptyString(id)) return Promise.reject(new ValidationError('id は必須です。', 'id'));
    return DB.get(STORE, id).then(function (r) { return r || null; });
  }

  // 部分更新。id / projectId / createdAt / sourceReportId は保護。
  function update(id, patch) {
    if (!isNonEmptyString(id)) return Promise.reject(new ValidationError('id は必須です。', 'id'));
    patch = patch || {};
    try {
      if ('type' in patch && !isValidType(patch.type)) throw new ValidationError('type は amamori / completion のみ。', 'type');
      if ('schemaVersion' in patch && !isPositiveInt(patch.schemaVersion)) throw new ValidationError('schemaVersion は正の整数。', 'schemaVersion');
      if ('data' in patch) assertNoBinary(patch.data);
    } catch (e) { return Promise.reject(e); }

    return DB.get(STORE, id).then(function (current) {
      if (!current) throw new ValidationError('帳票が見つかりません: ' + id, 'id');

      var merged = {}, k;
      for (k in current) if (current.hasOwnProperty(k)) merged[k] = current[k];
      for (k in patch) if (patch.hasOwnProperty(k)) merged[k] = patch[k];

      // metadata は浅くマージ → 最小フィールドを必ず保証
      var mm = {}, base = (current.metadata && typeof current.metadata === 'object') ? current.metadata : {};
      for (k in base) if (base.hasOwnProperty(k)) mm[k] = base[k];
      if (patch.metadata && typeof patch.metadata === 'object') {
        for (k in patch.metadata) if (patch.metadata.hasOwnProperty(k)) mm[k] = patch.metadata[k];
      }
      merged.metadata = normalizeMetadata(mm);

      // 保護フィールド
      merged.id = current.id;
      merged.projectId = current.projectId;
      merged.createdAt = current.createdAt;
      merged.sourceReportId = current.sourceReportId;
      if (isNonEmptyString(merged.title)) merged.title = merged.title.trim();
      merged.updatedAt = DB.nowISO();

      return DB.put(STORE, merged);
    });
  }

  // 削除（帳票レコードのみ）。写真(photos)の連鎖削除は field-api / photo-api へ委譲。
  function remove(id) {
    if (!isNonEmptyString(id)) return Promise.reject(new ValidationError('id は必須です。', 'id'));
    return DB.remove(STORE, id);
  }

  // 案件別一覧（projectId インデックス経由）。作成日時の昇順（時系列）。
  function listByProject(projectId) {
    if (!isNonEmptyString(projectId)) return Promise.reject(new ValidationError('projectId は必須です。', 'projectId'));
    return DB.query(STORE, 'projectId', projectId).then(function (rows) {
      rows = rows || [];
      rows.sort(byCreatedAsc);
      return rows;
    });
  }

  // 案件別 × 種別別一覧。
  function listByProjectAndType(projectId, type) {
    if (!isValidType(type)) return Promise.reject(new ValidationError('type は amamori / completion のみ。', 'type'));
    return listByProject(projectId).then(function (rows) {
      return rows.filter(function (r) { return r.type === type; });
    });
  }

  // 複製。sourceReportId を保持した新規レコードを作る（data は深いコピー）。
  //   overrides.projectId を指定すれば「別案件」へも複製できる（テンプレート利用）。
  //   複製先 projectId の存在も確認する。
  function copyFrom(sourceReportId, overrides) {
    if (!isNonEmptyString(sourceReportId)) return Promise.reject(new ValidationError('sourceReportId は必須です。', 'sourceReportId'));
    overrides = overrides || {};
    return DB.get(STORE, sourceReportId).then(function (src) {
      if (!src) throw new ValidationError('複製元の帳票が見つかりません: ' + sourceReportId, 'sourceReportId');
      var ts = DB.nowISO();
      var targetProjectId = isNonEmptyString(overrides.projectId) ? overrides.projectId : src.projectId;
      var record = {
        id: DB.genId('rep'),
        projectId: targetProjectId,
        type: isValidType(overrides.type) ? overrides.type : src.type,
        title: isNonEmptyString(overrides.title) ? overrides.title.trim() : src.title,
        schemaVersion: isPositiveInt(overrides.schemaVersion) ? overrides.schemaVersion : src.schemaVersion,
        data: deepClonePlain(overrides.data != null ? overrides.data : src.data),
        sourceReportId: src.id,
        createdAt: ts,
        updatedAt: ts,
        metadata: normalizeMetadata(overrides.metadata != null ? overrides.metadata : src.metadata)
      };
      assertNoBinary(record.data);
      return assertProjectExists(targetProjectId).then(function () {
        return DB.put(STORE, record);
      });
    });
  }

  function countByProject(projectId) {
    return listByProject(projectId).then(function (rows) { return rows.length; });
  }

  /* ---- 公開 ------------------------------------------------------------- */
  var IrakaReport = {
    STORE: STORE,
    TYPE: TYPE,
    TYPE_VALUES: TYPE_VALUES,
    TYPE_TITLE: TYPE_TITLE,
    ValidationError: ValidationError,

    create: create,
    get: get,
    update: update,
    remove: remove,
    listByProject: listByProject,
    listByProjectAndType: listByProjectAndType,
    copyFrom: copyFrom,
    countByProject: countByProject
  };

  global.IrakaReport = IrakaReport;
  if (typeof module !== 'undefined' && module.exports) module.exports = IrakaReport;

})(typeof globalThis !== 'undefined' ? globalThis
   : typeof self !== 'undefined' ? self
   : typeof window !== 'undefined' ? window
   : this);
