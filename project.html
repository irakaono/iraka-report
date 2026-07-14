/* =============================================================================
 * 甍AI Field  Ver.2.0  —  js/irbk.js
 * -----------------------------------------------------------------------------
 * 依存ゼロの ZIP 生成 / 展開（stored 方式 = 無圧縮）。
 *   - CDN 不要。オフラインの現場でそのまま動く。
 *   - .irbk（甍AI バックアップ）コンテナの土台。
 *
 *  API:
 *    IrakaIrbk.zip(entries) -> Uint8Array         entries: [{name, data:Uint8Array}]
 *    IrakaIrbk.unzip(bytes) -> [{name, data:Uint8Array}]
 *    IrakaIrbk.crc32(bytes) -> number
 *    IrakaIrbk.utf8(str) / IrakaIrbk.fromUtf8(bytes)
 *
 *  グローバル公開: window.IrakaIrbk
 * ========================================================================== */
(function (root) {
  'use strict';

  var CRC_TABLE = (function () {
    var t = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    // フォールバック
    var out = [], p = 0;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 128) out[p++] = c;
      else if (c < 2048) { out[p++] = (c >> 6) | 192; out[p++] = (c & 63) | 128; }
      else { out[p++] = (c >> 12) | 224; out[p++] = ((c >> 6) & 63) | 128; out[p++] = (c & 63) | 128; }
    }
    return new Uint8Array(out);
  }
  function fromUtf8(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return decodeURIComponent(escape(s));
  }

  function u16(n) { return [n & 0xff, (n >>> 8) & 0xff]; }
  function u32(n) { n = n >>> 0; return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]; }

  function concat(list) {
    var total = 0, i;
    for (i = 0; i < list.length; i++) total += list[i].length;
    var out = new Uint8Array(total), off = 0;
    for (i = 0; i < list.length; i++) { out.set(list[i], off); off += list[i].length; }
    return out;
  }

  // stored ZIP を生成
  function zip(entries) {
    var chunks = [], central = [], offset = 0;
    entries.forEach(function (e) {
      var nameB = utf8(e.name);
      var data = e.data || new Uint8Array(0);
      var crc = crc32(data);
      var local = [].concat(
        u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length), u16(nameB.length), u16(0)
      );
      var localHead = new Uint8Array(local);
      chunks.push(localHead, nameB, data);
      var cen = [].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length),
        u16(nameB.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)
      );
      central.push(new Uint8Array(cen), nameB);
      offset += localHead.length + nameB.length + data.length;
    });
    var centralBytes = concat(central);
    var eocd = [].concat(
      u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
      u32(centralBytes.length), u32(offset), u16(0)
    );
    return concat(chunks.concat([centralBytes, new Uint8Array(eocd)]));
  }

  // stored ZIP を展開（method=0 前提）
  function unzip(bytes) {
    if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var i = bytes.length - 22;
    for (; i >= 0; i--) { if (dv.getUint32(i, true) === 0x06054b50) break; }
    if (i < 0) throw new Error('ZIP の終端(EOCD)が見つかりません。');
    var count = dv.getUint16(i + 10, true);
    var cdOffset = dv.getUint32(i + 16, true);
    var p = cdOffset, out = [];
    for (var n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var compSize = dv.getUint32(p + 20, true);
      var nameLen = dv.getUint16(p + 28, true);
      var extraLen = dv.getUint16(p + 30, true);
      var commentLen = dv.getUint16(p + 32, true);
      var lho = dv.getUint32(p + 42, true);
      var name = fromUtf8(bytes.subarray(p + 46, p + 46 + nameLen));
      var lNameLen = dv.getUint16(lho + 26, true);
      var lExtra = dv.getUint16(lho + 28, true);
      var dataStart = lho + 30 + lNameLen + lExtra;
      var data = bytes.subarray(dataStart, dataStart + compSize);
      out.push({ name: name, data: new Uint8Array(data) });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  }

  var IrakaIrbk = { zip: zip, unzip: unzip, crc32: crc32, utf8: utf8, fromUtf8: fromUtf8 };
  root.IrakaIrbk = IrakaIrbk;
  if (typeof module !== 'undefined' && module.exports) module.exports = IrakaIrbk;

})(typeof window !== 'undefined' ? window
   : typeof globalThis !== 'undefined' ? globalThis
   : this);
