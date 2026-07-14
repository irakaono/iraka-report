/* =============================================================================
 * 甍AI Field  Ver.2.0  —  js/config.js
 * -----------------------------------------------------------------------------
 * 機能フラグ（Feature Flags）を一箇所に集約する。
 *   - 各機能の実装が完了したら、対応するフラグを true にするだけで画面が開通する。
 *   - HTML には true/false を直書きしない。すべて window.IrakaConfig 経由で参照する。
 *
 *  読み込み順（各HTML）:
 *    <script src="js/config.js"></script>
 *    <script src="js/db.js"></script>
 *    <script src="js/project-api.js"></script>
 *
 *  グローバル公開：window.IrakaConfig
 * ========================================================================== */
(function (global) {
  'use strict';

  var IrakaConfig = {
    // 帳票（report-api / report/*.html）が実装できたら true
    REPORT_READY: false,

    // 写真（photo-api）が実装できたら true
    PHOTO_READY: false,

    // AI所見が実装できたら true
    AI_READY: false,

    // 積算連携（Estimation）が実装できたら true
    ESTIMATION_READY: false
  };

  global.IrakaConfig = IrakaConfig;
  if (typeof module !== 'undefined' && module.exports) module.exports = IrakaConfig;

})(typeof globalThis !== 'undefined' ? globalThis
   : typeof self !== 'undefined' ? self
   : typeof window !== 'undefined' ? window
   : this);
