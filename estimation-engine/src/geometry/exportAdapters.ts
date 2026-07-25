// 甍AI Estimation OS — Export Adapters（e0.3.5④ / Ports & Adapters の Adapter 層）
// ★Adapter の役割は「ExportResult を媒体へ写すだけ」。積算・単位変換・フィルタ・丸めは書かない。
//   それらは "ExportResult を変える処理" ＝ Adapter ではなく別レイヤー Transform(ExportResult → ExportResult)。
//
//   ExportResult ──┬── JSON Adapter   : JSON.stringify 以上のことをしない
//                  ├── CSV Adapter    : 列を並べ替えるだけ（値は無加工・full precision）
//                  └── Clipboard Adapter : JSON テキストをそのままクリップボードへ写す
//
//   禁止例（すべて ExportResult を変える処理 → ここに書かない）:
//     ・㎡ を 坪 へ変換   ・屋根工事だけ出力   ・数量を丸める
//   加工したくなったら CSVAdapter ではなく TsuboTransform 等の Transform レイヤーを別に作る。
import type { ExportResult } from './exportResult';

/** JSON Adapter: ExportResult を無加工で JSON テキストへ。JSON.stringify 以上のことをしない。 */
export function toJson(result: ExportResult): string {
  return JSON.stringify(result, null, 2);
}

// CSV セルの表現（エスケープ）。値の加工ではなく「,"改行を含む値を安全に写す」ための表記のみ。
function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * CSV Adapter: ExportResult.summaries を CSV へ「列を並べ替えるだけ」で写す。
 * ★数量は無加工（full precision）。丸めない・単位変換しない・行を絞らない。
 *   measurementIds（配列）は 1 セルに ';' 区切りで表記するだけ（＝表現、値は不変）。
 */
export function toCsv(result: ExportResult): string {
  const header = ['trade', 'item', 'quantity', 'unit', 'measurementIds'];
  const rows = result.summaries.map((s) => [
    csvCell(s.trade),
    csvCell(s.item),
    csvCell(String(s.quantity)),        // ★String 化のみ。toFixed 等の丸めは一切しない
    csvCell(s.unit),
    csvCell(s.measurementIds.join(';')),
  ].join(','));
  return [header.join(','), ...rows].join('\r\n');
}
