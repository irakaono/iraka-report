/* =============================================================================
 * 甍AI Field  Ver.2.0  —  js/project-api.js
 * -----------------------------------------------------------------------------
 * IrakaProject : 案件（projects）専用の API 層
 *
 *  責務（これだけ）:
 *    案件の 作成 / 取得 / 更新 / 削除 / 一覧 / 検索 / 状態変更。
 *    reports・photos には一切触れない。連鎖削除等は field-api（後工程）へ委譲。
 *
 *  依存: js/db.js（window.IrakaDB）。HTML では db.js を先に読み込むこと。
 *
 *  案件レコード:
 *    {
 *      id, name, customer, address,
 *      status:  active | completed | archived,
 *      kind:    housing | factory | public | roof | inspection | other,
 *      createdAt, updatedAt,
 *      extensions: { previousStatus?, estimationRef?, drawings?, ... }
 *    }
 *
 *  ライフサイクル: 施工中(active) → 完成(completed) → 〔OB管理〕 → アーカイブ(archived)
 *    archive() は直前の status を extensions.previousStatus に退避し、
 *    unarchive() はそれを復元する（completed→archive→unarchive で completed に戻る）。
 *
 *  グローバル公開: window.IrakaProject
 * ========================================================================== */
(function (global) {
  'use strict';

  var DB = global.IrakaDB ||
    (typeof require !== 'undefined' ? require('./db.js') : null);
  if (!DB) {
    throw new Error('[project-api] IrakaDB (js/db.js) が読み込まれていません。db.js を先に読み込んでください。');
  }

  var STORE = 'projects';

  var STATUS = { ACTIVE: 'active', COMPLETED: 'completed', ARCHIVED: 'archived' };
  var STATUS_VALUES = [STATUS.ACTIVE, STATUS.COMPLETED, STATUS.ARCHIVED];

  var KIND = {
    HOUSING: 'housing', FACTORY: 'factory', PUBLIC: 'public',
    ROOF: 'roof', INSPECTION: 'inspection', OTHER: 'other'
  };
  var KIND_VALUES = [KIND.HOUSING, KIND.FACTORY, KIND.PUBLIC, KIND.ROOF, KIND.INSPECTION, KIND.OTHER];
  var DEFAULT_KIND = KIND.HOUSING;

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
  function isValidStatus(s) { return STATUS_VALUES.indexOf(s) !== -1; }
  function isValidKind(k) { return KIND_VALUES.indexOf(k) !== -1; }

  function normalizeForCreate(input) {
    input = input || {};
    if (!isNonEmptyString(input.name)) {
      throw new ValidationError('案件名（name）は必須です。', 'name');
    }
    var ts = DB.nowISO();
    return {
      id: isNonEmptyString(input.id) ? input.id : DB.genId('proj'),
      name: input.name.trim(),
      customer: isNonEmptyString(input.customer) ? input.customer.trim() : '',
      address: isNonEmptyString(input.address) ? input.address.trim() : '',
      status: isValidStatus(input.status) ? input.status : STATUS.ACTIVE,
      kind: isValidKind(input.kind) ? input.kind : DEFAULT_KIND,
      createdAt: ts,
      updatedAt: ts,
      extensions: (input.extensions && typeof input.extensions === 'object') ? input.extensions : {}
    };
  }

  function byUpdatedDesc(a, b) {
    var av = a && a.updatedAt ? a.updatedAt : '';
    var bv = b && b.updatedAt ? b.updatedAt : '';
    return av < bv ? 1 : av > bv ? -1 : 0;
  }

  /* ---- API -------------------------------------------------------------- */
  function create(input) {
    var record;
    try { record = normalizeForCreate(input); }
    catch (e) { return Promise.reject(e); }
    return DB.put(STORE, record);
  }

  function get(id) {
    if (!isNonEmptyString(id)) return Promise.reject(new ValidationError('id は必須です。', 'id'));
    return DB.get(STORE, id).then(function (r) { return r || null; });
  }

  function update(id, patch) {
    if (!isNonEmptyString(id)) return Promise.reject(new ValidationError('id は必須です。', 'id'));
    patch = patch || {};
    return DB.get(STORE, id).then(function (current) {
      if (!current) throw new ValidationError('案件が見つかりません: ' + id, 'id');

      if ('name' in patch && !isNonEmptyString(patch.name)) {
        throw new ValidationError('案件名（name）は空にできません。', 'name');
      }
      if ('status' in patch && !isValidStatus(patch.status)) {
        throw new ValidationError('status は active / completed / archived のみ。', 'status');
      }
      if ('kind' in patch && !isValidKind(patch.kind)) {
        throw new ValidationError('kind が不正です。', 'kind');
      }

      var merged = {}, k;
      for (k in current) if (current.hasOwnProperty(k)) merged[k] = current[k];
      for (k in patch) if (patch.hasOwnProperty(k)) merged[k] = patch[k];

      // extensions は浅くマージ（既存キーを残しつつ上書き）
      if (patch.extensions && typeof patch.extensions === 'object') {
        var ext = {}, base = (current.extensions && typeof current.extensions === 'object') ? current.extensions : {};
        for (k in base) if (base.hasOwnProperty(k)) ext[k] = base[k];
        for (k in patch.extensions) if (patch.extensions.hasOwnProperty(k)) ext[k] = patch.extensions[k];
        merged.extensions = ext;
      }

      merged.id = current.id;
      merged.createdAt = current.createdAt;
      if (isNonEmptyString(merged.name)) merged.name = merged.name.trim();
      if (!isValidKind(merged.kind)) merged.kind = DEFAULT_KIND;
      if (!isValidStatus(merged.status)) merged.status = STATUS.ACTIVE;
      merged.updatedAt = DB.nowISO();

      return DB.put(STORE, merged);
    });
  }

  function remove(id) {
    if (!isNonEmptyString(id)) return Promise.reject(new ValidationError('id は必須です。', 'id'));
    return DB.remove(STORE, id);
  }

  // 一覧。status / kind 単独指定はインデックス経由（getAll + filter を避ける）。
  function list(options) {
    options = options || {};
    var byKind = options.kind && !options.status;
    var byStatus = options.status && !options.kind;

    var base;
    if (byKind)        base = DB.query(STORE, 'kind', options.kind);
    else if (byStatus) base = DB.query(STORE, 'status', options.status);
    else               base = DB.getAll(STORE);

    return base.then(function (rows) {
      rows = rows || [];
      // 両方指定のときは、片方をインデックス、もう片方を絞り込みで適用
      if (options.status && options.kind) {
        rows = rows.filter(function (r) { return r.status === options.status && r.kind === options.kind; });
      }
      if (options.sort === 'name') {
        rows.sort(function (a, b) { return (a.name || '').localeCompare((b.name || ''), 'ja'); });
      } else {
        rows.sort(byUpdatedDesc);
      }
      return rows;
    });
  }

  function search(keyword, options) {
    var kw = isNonEmptyString(keyword) ? keyword.trim().toLowerCase() : '';
    return list(options).then(function (rows) {
      if (!kw) return rows;
      return rows.filter(function (r) {
        return [r.name, r.customer, r.address].some(function (f) {
          return typeof f === 'string' && f.toLowerCase().indexOf(kw) !== -1;
        });
      });
    });
  }

  /* ---- 状態遷移 --------------------------------------------------------- */
  function setStatus(id, status) {
    if (!isValidStatus(status)) return Promise.reject(new ValidationError('status が不正です。', 'status'));
    return update(id, { status: status });
  }

  // 施工中 → 完成
  function complete(id) { return setStatus(id, STATUS.COMPLETED); }

  // 完成/その他 → 施工中（明示的に active へ戻す。退避状態はクリア）
  function reopen(id) { return update(id, { status: STATUS.ACTIVE, extensions: { previousStatus: null } }); }

  // アーカイブ：直前の status を退避してから archived にする
  function archive(id) {
    if (!isNonEmptyString(id)) return Promise.reject(new ValidationError('id は必須です。', 'id'));
    return DB.get(STORE, id).then(function (cur) {
      if (!cur) throw new ValidationError('案件が見つかりません: ' + id, 'id');
      var prev = (cur.status === STATUS.ACTIVE || cur.status === STATUS.COMPLETED) ? cur.status : STATUS.ACTIVE;
      return update(id, { status: STATUS.ARCHIVED, extensions: { previousStatus: prev } });
    });
  }

  // 復帰：退避した previousStatus に戻す（無ければ active）。退避はクリア。
  function unarchive(id) {
    if (!isNonEmptyString(id)) return Promise.reject(new ValidationError('id は必須です。', 'id'));
    return DB.get(STORE, id).then(function (cur) {
      if (!cur) throw new ValidationError('案件が見つかりません: ' + id, 'id');
      var prev = cur.extensions && cur.extensions.previousStatus;
      var target = (prev === STATUS.ACTIVE || prev === STATUS.COMPLETED) ? prev : STATUS.ACTIVE;
      return update(id, { status: target, extensions: { previousStatus: null } });
    });
  }

  function count(options) {
    options = options || {};
    if (!options.status && !options.kind) return DB.count(STORE);
    return list(options).then(function (rows) { return rows.length; });
  }

  /* ---- 公開 ------------------------------------------------------------- */
  var IrakaProject = {
    STORE: STORE,
    STATUS: STATUS,
    STATUS_VALUES: STATUS_VALUES,
    KIND: KIND,
    KIND_VALUES: KIND_VALUES,
    DEFAULT_KIND: DEFAULT_KIND,
    ValidationError: ValidationError,

    create: create,
    get: get,
    update: update,
    remove: remove,
    list: list,
    search: search,

    setStatus: setStatus,
    complete: complete,
    reopen: reopen,
    archive: archive,
    unarchive: unarchive,

    count: count
  };

  global.IrakaProject = IrakaProject;
  if (typeof module !== 'undefined' && module.exports) module.exports = IrakaProject;

})(typeof globalThis !== 'undefined' ? globalThis
   : typeof self !== 'undefined' ? self
   : typeof window !== 'undefined' ? window
   : this);
