// 甍AI 見積書エクスポート — 積算(Quantity＋Program)を「見積書式」の行に組む純関数。
//   ★ここは行データを作るだけ（副作用なし・テスト可）。xlsx 書き出しは Studio 側で SheetJS(必要時CDN)。
//   雨樋は WITH DOM Program で価格つき。屋根は数量のみ（屋根Program確定後に単価が入る＝正直に空欄）。
import type { QuantityResult } from './roofModel';
import { applyGutterProgram } from './acceptance';
import type { GutterProgram } from './acceptance';

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

export interface EstimateRow {
  section: string;            // '雨樋' | '屋根'
  name: string;               // 品名
  qty: number;                // 数量
  unit: string;               // 単位
  unitPrice: number | null;   // 単価（未設定は null）
  amount: number | null;      // 金額（未設定は null）
  note: string;               // 摘要
}
export interface EstimateDoc {
  rows: EstimateRow[];
  subtotal: number;           // 価格つき行の小計（＝雨樋・諸経費込）
  tax: number;
  total: number;
  pricedNote: string;         // 価格の範囲の注記
}

// 屋根数量(rq) と 雨樋数量(dq) → 見積書式の行。overhead=諸経費（案件入力）。
export function buildEstimate(roofQ: QuantityResult[], drainQ: QuantityResult[], program: GutterProgram, overhead = 0): EstimateDoc {
  const rows: EstimateRow[] = [];
  // 雨樋（WITH DOM Program の単価つき）
  const est = applyGutterProgram(drainQ, program, overhead);
  for (const l of est.lines) rows.push({ section: '雨樋', name: l.name, qty: round3(l.qty), unit: l.unit, unitPrice: l.unitPrice, amount: l.amount, note: '' });
  if (overhead) rows.push({ section: '雨樋', name: '諸経費', qty: 1, unit: '式', unitPrice: overhead, amount: overhead, note: '' });
  // 屋根（数量のみ・単価は屋根Program確定後）
  for (const q of roofQ) rows.push({ section: '屋根', name: q.label, qty: round3(q.value), unit: q.unit, unitPrice: null, amount: null, note: '数量（単価は屋根Program確定後）' });
  return { rows, subtotal: est.subtotal, tax: est.tax, total: est.total, pricedNote: '価格は雨樋(WITH DOM)のみ。屋根は数量。' };
}

// 見積書式の二次元配列（xlsx / プレビュー共通）。会社の見積書ヘッダ＋明細＋小計/税/合計。
export function estimateToAOA(doc: EstimateDoc, meta: { title?: string; date?: string; issuer?: string }): (string | number)[][] {
  const aoa: (string | number)[][] = [];
  aoa.push(['御 見 積 書']);
  aoa.push([`件名: ${meta.title ?? ''}`, '', '', '', `日付: ${meta.date ?? ''}`, '']);
  aoa.push([`${meta.issuer ?? '株式会社 甍'}`]);
  aoa.push([]);
  aoa.push(['品名', '数量', '単位', '単価', '金額', '摘要']);
  for (const r of doc.rows) aoa.push([r.name, r.qty, r.unit, r.unitPrice ?? '', r.amount ?? '', r.note]);
  aoa.push([]);
  aoa.push(['', '', '', '小計', doc.subtotal, '']);
  aoa.push(['', '', '', '消費税', doc.tax, '']);
  aoa.push(['', '', '', '合計', doc.total, doc.pricedNote]);
  return aoa;
}
