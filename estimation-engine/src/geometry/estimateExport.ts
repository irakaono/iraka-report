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

// ─────────────────────────────────────────────────────────────────────────────
// 甍 見積書「書式」完全一致版（会社テンプレ 見積書書式.xls の 35列グリッドを再現）。
//   ★純関数：ExcelJS 非依存の GridSpec（セル/結合/罫線/列幅/行高）を返す＝テスト可。
//   ★描画は Studio 側で ExcelJS(CDN) が GridSpec を適用するだけ。テンプレの座標・結合・罫線・数値書式に一致。
// ─────────────────────────────────────────────────────────────────────────────
export type HAlign = 'left' | 'center' | 'right';
export interface Border4 { top?: boolean; bottom?: boolean; left?: boolean; right?: boolean; style?: 'thin' | 'medium' | 'double' }
export interface GridCell {
  r: number; c: number; v: string | number;
  size?: number; bold?: boolean; align?: HAlign; numFmt?: string; border?: Border4;
}
export interface GridSpec {
  colCount: number;
  colWidth: number[];                 // ExcelJS 文字幅（列ごと）
  rowHeight: { r: number; h: number }[]; // pt
  merges: [number, number, number, number][]; // [r1,c1,r2,c2]（0基点・両端含む）
  cells: GridCell[];
  tableBox: { r1: number; c1: number; r2: number; c2: number }; // 明細表の外枠（全セル thin 罫線）
  vSeps: number[];                    // 明細表の縦罫線を入れる列境界（左側に線）
}

const YEN_FMT = '_ "¥"#,##0\\-';
const NUM_FMT = '#,##0_;';

// 35列テンプレの完全一致グリッド。明細は doc.rows の行数に合わせて可変（最低13行＝テンプレ枠を確保）。
export function buildQuotationGrid(doc: EstimateDoc, meta: QuotationMeta): GridSpec {
  const I = IRAKA_ISSUER;
  const COLS = 35;
  const cells: GridCell[] = [];
  const merges: [number, number, number, number][] = [];
  const put = (c: GridCell) => cells.push(c);
  const m = (r1: number, c1: number, r2: number, c2: number) => merges.push([r1, c1, r2, c2]);
  const rd = reiwaDate(meta.date); // 令和N年M月D日（無ければ空）
  const ry = rd ? rd.match(/令和(\d+)年(\d+)月(\d+)日/) : null;

  // ── ヘッダ（罫線なし・テンプレ座標。結合は全て単一行の横結合＝xlrd の [rlo,rhi) に一致） ──
  m(0, 11, 0, 23); put({ r: 0, c: 11, v: '御　見　積　書', size: 20, align: 'center', border: { bottom: true, style: 'double' } });
  put({ r: 2, c: 12, v: '令和' });
  put({ r: 2, c: 15, v: ry ? `${ry[1]}年` : '年' });
  put({ r: 2, c: 18, v: ry ? `${ry[2]}月` : '月' });
  put({ r: 2, c: 21, v: ry ? `${ry[3]}日` : '日' });
  m(4, 1, 4, 14); put({ r: 4, c: 1, v: `${meta.customer ?? ''}`, align: 'center', border: { bottom: true, style: 'thin' } });
  put({ r: 4, c: 15, v: '様' });
  m(4, 21, 4, 34); put({ r: 4, c: 21, v: I.company, align: 'center' });
  put({ r: 5, c: 21, v: I.office });
  put({ r: 6, c: 21, v: I.zip });
  put({ r: 7, c: 21, v: I.addr });
  put({ r: 8, c: 1, v: `　件名　${meta.title ?? ''}` });
  put({ r: 8, c: 21, v: I.tel });
  put({ r: 9, c: 1, v: `現場住所　${meta.site ?? ''}` });
  put({ r: 10, c: 1, v: `工事名　${meta.work ?? ''}` });
  put({ r: 10, c: 21, v: '担当者　' }); put({ r: 10, c: 25, v: I.staff });
  put({ r: 11, c: 1, v: `有効期限　${meta.validUntil ?? ''}` });
  put({ r: 11, c: 22, v: '携帯電話', align: 'center' }); put({ r: 11, c: 25, v: I.mobile });
  put({ r: 12, c: 21, v: 'mail' }); put({ r: 12, c: 25, v: I.mail });
  put({ r: 14, c: 1, v: '税込合計金額', size: 14, border: { bottom: true, style: 'thin' } });
  m(14, 8, 14, 18); put({ r: 14, c: 8, v: doc.total, size: 18, align: 'right', numFmt: YEN_FMT, border: { bottom: true, style: 'thin' } });
  put({ r: 14, c: 19, v: '（消費税込み）', border: { bottom: true, style: 'thin' } });

  // ── 明細表 ──（16=見出し / 17..=明細 / 続けて 小計・消費税・合計）
  const HEAD = 16;
  // 6ブロックの列境界（左端c, 右端は次境界-1）：品名0-14, 数量15-17, 単位18-19, 単価20-22, 金額23-27, 摘要28-34
  const blocks: [number, number, HAlign][] = [[0, 14, 'left'], [15, 17, 'right'], [18, 19, 'center'], [20, 22, 'right'], [23, 27, 'right'], [28, 34, 'left']];
  const vSeps = [15, 18, 20, 23, 28]; // 各ブロック左に縦線
  const headLabels = ['品名', '数量', '単位', '単価', '金額', '摘要'];
  const mergeRow = (r: number) => { for (const [c1, c2] of blocks) if (c2 > c1) m(r, c1, r, c2); };
  mergeRow(HEAD);
  blocks.forEach(([c1], i) => put({ r: HEAD, c: c1, v: headLabels[i], align: 'center' }));

  const nDetail = Math.max(13, doc.rows.length); // テンプレは13行枠。超過時は表を伸ばす。
  let r = HEAD + 1;
  for (let i = 0; i < nDetail; i++, r++) {
    mergeRow(r);
    const row = doc.rows[i];
    if (!row) continue;
    put({ r, c: 0, v: row.name, align: 'left' });
    put({ r, c: 15, v: row.qty, align: 'right' });
    put({ r, c: 18, v: row.unit, align: 'center' });
    if (row.unitPrice != null) put({ r, c: 20, v: row.unitPrice, align: 'right', numFmt: NUM_FMT });
    if (row.amount != null) put({ r, c: 23, v: row.amount, align: 'right', numFmt: NUM_FMT });
    if (row.note) put({ r, c: 28, v: row.note, align: 'left' });
  }
  const detailEnd = r - 1;
  // 小計 / 消費税等 / 合計（ラベル c0-22 右寄せ・金額 c23-27・摘要 c28-34）
  const totalRows: [string, number, string][] = [['小　計', doc.subtotal, ''], ['消費税等', doc.tax, '１０％'], ['合　計', doc.total, '']];
  for (const [label, amount, note] of totalRows) {
    m(r, 0, r, 22); m(r, 23, r, 27); m(r, 28, r, 34);
    put({ r, c: 0, v: label, align: 'right' });
    put({ r, c: 23, v: amount, align: 'right', numFmt: NUM_FMT });
    if (note) put({ r, c: 28, v: note, size: 9, align: 'left' });
    r++;
  }
  const tableEnd = r - 1;
  put({ r, c: 0, v: `備考：　${doc.pricedNote}` });

  // 列幅（テンプレ 682/256≒2.66文字。要所だけ広め）
  const colWidth = Array.from({ length: COLS }, () => 2.66);
  colWidth[0] = 2.78; colWidth[8] = 3.33; colWidth[21] = 3.44;
  // 行高（テンプレ準拠）
  const rowHeight: { r: number; h: number }[] = [
    { r: 0, h: 30 }, { r: 1, h: 12 }, { r: 2, h: 18 }, { r: 3, h: 12 },
    { r: 4, h: 18 }, { r: 5, h: 18 }, { r: 6, h: 18 }, { r: 7, h: 18 }, { r: 8, h: 18 },
    { r: 9, h: 18 }, { r: 10, h: 18 }, { r: 11, h: 18 }, { r: 12, h: 18 }, { r: 14, h: 18 }, { r: 16, h: 18 },
  ];
  for (let rr = HEAD + 1; rr <= tableEnd; rr++) rowHeight.push({ r: rr, h: 24.9 });

  return {
    colCount: COLS, colWidth, rowHeight, merges, cells,
    tableBox: { r1: HEAD, c1: 0, r2: tableEnd, c2: 34 },
    vSeps: vSeps.concat([0, 35]), // 外枠含む縦線位置（描画側で使用）
  };
}
