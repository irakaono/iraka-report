// 甍AI 見積書エクスポート — 積算(Quantity＋Program)を「見積書式」の行に組む純関数。
//   ★ここは行データを作るだけ（副作用なし・テスト可）。xlsx 書き出しは Studio 側で SheetJS(必要時CDN)。
//   雨樋は WITH DOM Program で価格つき。屋根は数量のみ（屋根Program確定後に単価が入る＝正直に空欄）。
import type { QuantityResult } from './roofModel';
import type { GutterProgram } from './acceptance';

// Domain Program（Roof / Gutter 共通の価格つき明細プログラム）。quantityKey→品名/単位/単価。
export type DomainProgram = GutterProgram;

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

// 屋根数量(rq) と 雨樋数量(dq) → 見積書式の行。屋根＝Roof Domain Program（無ければ数量のみ）、雨樋＝Gutter Domain Program。overhead=諸経費。
export function buildEstimate(
  roofQ: QuantityResult[], drainQ: QuantityResult[], gutterProgram: DomainProgram,
  roofProgram?: DomainProgram | null, overhead = 0,
): EstimateDoc {
  const rows: EstimateRow[] = [];
  let sum = 0;
  const priceLines = (quantities: QuantityResult[], program: DomainProgram, section: string) => {
    for (const spec of program.lines) {
      const qv = quantities.find((q) => q.key === spec.quantityKey)?.value;
      if (qv == null || qv <= 0) continue;             // 数量が無い項目は出さない
      const qty = round3(qv);
      const amount = Math.round(qty * spec.unitPrice);
      rows.push({ section, name: spec.name, qty, unit: spec.unit, unitPrice: spec.unitPrice, amount, note: '' });
      sum += amount;
    }
  };
  // 屋根（Roof Domain Program。無ければ数量のみ・単価空欄）
  if (roofProgram) priceLines(roofQ, roofProgram, '屋根');
  else for (const q of roofQ) rows.push({ section: '屋根', name: q.label, qty: round3(q.value), unit: q.unit, unitPrice: null, amount: null, note: '数量（単価は屋根Program確定後）' });
  // 雨樋（Gutter Domain Program）
  priceLines(drainQ, gutterProgram, '雨樋');
  // 諸経費
  if (overhead) { rows.push({ section: '諸経費', name: '諸経費', qty: 1, unit: '式', unitPrice: overhead, amount: overhead, note: '' }); sum += overhead; }
  const subtotal = sum;
  const tax = Math.round(subtotal * (gutterProgram.taxRate ?? 0.1));
  const pricedNote = roofProgram
    ? '屋根＋雨樋 価格つき（換気棟・雨押え・通気部材・唐草60 等の詳細項目は別途手入力）'
    : '価格は雨樋(WITH DOM)のみ。屋根は数量。';
  return { rows, subtotal, tax, total: subtotal + tax, pricedNote };
}

// 甍の見積書 発行者情報（会社テンプレート 見積書書式.xls より）。
export const IRAKA_ISSUER = {
  company: '株式会社　甍', office: '坂戸営業所', zip: '〒350-0244', addr: '埼玉県坂戸市森戸1282-2',
  tel: 'TEL/FAX　049-277-3376', staff: '小野　哲也', mobile: '090-4946-6247', mail: 'iraka-ono@outlook.jp',
};
export interface QuotationMeta { customer?: string; title?: string; site?: string; work?: string; date?: string; validUntil?: string }
export interface Merge { s: { r: number; c: number }; e: { r: number; c: number } }
export interface SheetSpec { aoa: (string | number)[][]; merges: Merge[]; cols: { wch: number }[] }

function reiwaDate(iso?: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `令和${y - 2018}年${m}月${d}日`;
}
const yen = (n: number): string => `¥${Math.round(n).toLocaleString('ja-JP')}-`;

// 甍の見積書書式で 見積書 シートを組む（品名/数量/単位/単価/金額/摘要＋発行者ヘッダ＋小計/消費税/合計）。
export function buildQuotation(doc: EstimateDoc, meta: QuotationMeta): SheetSpec {
  const I = IRAKA_ISSUER;
  const a: (string | number)[][] = [];
  const merges: Merge[] = [];
  const wide = (r: number) => merges.push({ s: { r, c: 0 }, e: { r, c: 5 } }); // 0〜5列を結合
  a.push(['御　見　積　書']); wide(0);                                     // 0
  a.push(['', '', '', '', reiwaDate(meta.date), '']);                                    // 1
  a.push([`${meta.customer ?? ''}　様`, '', '', I.company, '', '']);                 // 2
  a.push(['', '', '', `${I.office}　${I.zip}　${I.addr}`, '', '']);              // 3
  a.push(['', '', '', `${I.tel}　担当 ${I.staff}　${I.mobile}`, '', '']);        // 4
  a.push([`件名　${meta.title ?? ''}`, '', '', `mail　${I.mail}`, '', '']);      // 5
  a.push([`現場住所　${meta.site ?? ''}`, '', '', '', '', '']);                       // 6
  a.push([`工事名　${meta.work ?? ''}`, '', '', `有効期限　${meta.validUntil ?? ''}`, '', '']); // 7
  a.push([`税込合計金額　${yen(doc.total)}　（消費税込み）`]); wide(8);           // 8
  a.push([]);                                                                            // 9
  const headerRow = a.length;
  a.push(['品名', '数量', '単位', '単価', '金額', '摘要']);                              // 10 明細見出し
  for (const r of doc.rows) a.push([r.name, r.qty, r.unit, r.unitPrice ?? '', r.amount ?? '', r.note]);
  a.push([]);
  a.push(['', '', '', '小　計', doc.subtotal, '']);
  a.push(['', '', '', '消費税等', doc.tax, '１０％']);
  a.push(['', '', '', '合　計', doc.total, '']);
  a.push([`備考：　${doc.pricedNote}`]);
  const cols = [{ wch: 34 }, { wch: 8 }, { wch: 6 }, { wch: 12 }, { wch: 14 }, { wch: 22 }];
  return { aoa: a, merges, cols, headerRow } as SheetSpec & { headerRow: number };
}
