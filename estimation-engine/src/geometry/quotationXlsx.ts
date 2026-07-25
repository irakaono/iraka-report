// 甍 見積書「書式」完全一致の xlsx 描画（ExcelJS）。GridSpec → ワークシート。
//   ★ExcelJS 本体は引数で受け取る（browser=window.ExcelJS(UMD/CDN)、node test=require('exceljs')）＝依存を注入。
//   ★罫線：明細表は全セル thin の外枠＋ブロック縦線。結合により内部線は消え、各ブロックが箱になる（テンプレの見た目）。
import type { EstimateDoc, QuotationMeta, GridSpec, HAlign } from './estimateExport';
import { buildQuotationGrid } from './estimateExport';

// ExcelJS の最小型（依存注入用）。実体は UMD/CommonJS の Workbook を持つ名前空間。
export interface ExcelJSLike { Workbook: new () => any }

const alignMap: Record<HAlign, string> = { left: 'left', center: 'center', right: 'right' };
const thin = { style: 'thin' as const };

// GridSpec を ExcelJS ワークシートに描く。返り値は書き出し可能な Workbook。
export function renderQuotationWorkbook(ExcelJS: ExcelJSLike, grid: GridSpec): any {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('見積書', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
    views: [{ showGridLines: false }],
  });
  // 列幅
  for (let c = 0; c < grid.colCount; c++) ws.getColumn(c + 1).width = grid.colWidth[c];
  // 行高
  for (const { r, h } of grid.rowHeight) ws.getRow(r + 1).height = h;
  ws.properties.defaultRowHeight = 18;

  // 明細表：外枠＋縦線を先に敷く（結合で内部は消える）
  const box = grid.tableBox;
  const seps = new Set(grid.vSeps);
  for (let r = box.r1; r <= box.r2; r++) {
    for (let c = box.c1; c <= box.c2; c++) {
      const cell = ws.getCell(r + 1, c + 1);
      const b: any = { top: thin, bottom: thin };
      if (seps.has(c)) b.left = thin;
      if (seps.has(c + 1)) b.right = thin;
      if (c === box.c1) b.left = thin;
      if (c === box.c2) b.right = thin;
      cell.border = b;
    }
  }
  // 結合
  for (const [r1, c1, r2, c2] of grid.merges) ws.mergeCells(r1 + 1, c1 + 1, r2 + 1, c2 + 1);
  // セル（値・書体・寄せ・数値書式・個別罫線）
  for (const cd of grid.cells) {
    const cell = ws.getCell(cd.r + 1, cd.c + 1);
    cell.value = cd.v;
    cell.font = { name: 'ＭＳ Ｐゴシック', size: cd.size ?? 11, bold: !!cd.bold };
    cell.alignment = { vertical: 'middle', horizontal: alignMap[cd.align ?? 'left'] };
    if (cd.numFmt) cell.numFmt = cd.numFmt;
    if (cd.border) {
      const st = cd.border.style ?? 'thin';
      const line = { style: st } as any;
      const b: any = { ...(cell.border || {}) };
      if (cd.border.top) b.top = line;
      if (cd.border.bottom) b.bottom = line;
      if (cd.border.left) b.left = line;
      if (cd.border.right) b.right = line;
      cell.border = b;
    }
  }
  return wb;
}

// doc/meta から直接 Workbook を作る便利関数。
export function buildQuotationWorkbook(ExcelJS: ExcelJSLike, doc: EstimateDoc, meta: QuotationMeta): any {
  return renderQuotationWorkbook(ExcelJS, buildQuotationGrid(doc, meta));
}
