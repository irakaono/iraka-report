// 甍AI Presentation Adapters — Domain IR → 表示形式（Excel/PDF/CSV/API/画面）。
//   ★「Export」は存在しない。これは Presentation Adapter。Domain IR を【読むだけ】で、値も構造も変えない。
//   ★1つの Domain IR に複数 Adapter（open set）。ここに積算/変換/丸めは書かない（それは Domain Compiler の責務）。
//   ★evidence は Domain IR が保持。表示は lossy でよい（PDF に全 id を出さない等）が、値は変えない。
import type { PresentationAdapter, OrderIR, EstimateIR } from './domainCompiler';
import type { TaskGraphIR } from './scheduleCompiler';
import type { InspectionIR } from './qaCompiler';
import type { CarbonIR } from './carbonCompiler';
import type { ResourceIR } from './resourceCompiler';

function csvCell(v: string): string { return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }

// ── Estimate IR → 画面用 金額行 ──
export interface AmountRow { label: string; amount: number; }
export const estimateToRows: PresentationAdapter<EstimateIR, AmountRow[]> = (ir) => [
  { label: '材料費', amount: ir.materialCost },
  { label: '労務費', amount: ir.laborCost },
  { label: '間接費', amount: ir.indirectCost },
  { label: '合計', amount: ir.total },
];

// ── Estimate IR → CSV（見積内訳。値は無加工で写すだけ） ──
export const estimateToCsv: PresentationAdapter<EstimateIR, string> = (ir) => {
  const rows: string[] = ['区分,名称,数量,単位,金額'];
  for (const m of ir.materials) rows.push(['材料', m.name, String(m.qty), m.unit, String(m.cost ?? '')].map(csvCell).join(','));
  for (const l of ir.labor) rows.push(['労務', l.operation, String(l.labor), '人工', String(l.cost)].map(csvCell).join(','));
  rows.push([',材料費計,,,', String(ir.materialCost)].join(''));
  rows.push([',労務費計,,,', String(ir.laborCost)].join(''));
  rows.push([',間接費,,,', String(ir.indirectCost)].join(''));
  rows.push([',合計,,,', String(ir.total)].join(''));
  return rows.join('\r\n');
};

// ── Order IR → CSV（発注書。値は無加工） ──
export const orderToCsv: PresentationAdapter<OrderIR, string> = (ir) => {
  const rows: string[] = ['sku,名称,数量,単位'];
  for (const l of ir.lines) rows.push([l.sku ?? '', l.name, String(l.qty), l.unit].map(csvCell).join(','));
  return rows.join('\r\n');
};

// ── TaskGraph IR → 工程行（画面/工程表）。クリティカルは印。 ──
export interface TaskRow { operation: string; duration: number; start: number; finish: number; critical: boolean; }
export const taskGraphToRows: PresentationAdapter<TaskGraphIR, TaskRow[]> = (ir) =>
  ir.tasks.map((t) => ({ operation: t.operation, duration: t.duration, start: t.earliestStart, finish: t.earliestFinish, critical: t.critical }));

// ── Inspection IR → 検査行（画面/検査表）。 ──
export interface CheckRow { label: string; actual: number; op: string; threshold: number; pass: boolean; severity: string; }
export const inspectionToRows: PresentationAdapter<InspectionIR, CheckRow[]> = (ir) =>
  ir.checks.map((c) => ({ label: c.label, actual: c.actual, op: c.op, threshold: c.threshold, pass: c.pass, severity: c.severity }));

// ── Carbon IR → CO₂行（材料/輸送/施工/合計）。 ──
export interface CarbonRow { label: string; co2: number; }
export const carbonToRows: PresentationAdapter<CarbonIR, CarbonRow[]> = (ir) => [
  { label: '材料CO₂', co2: ir.materialCO2 },
  { label: '輸送CO₂', co2: ir.transportCO2 },
  { label: '施工CO₂', co2: ir.constructionCO2 },
  { label: '合計CO₂', co2: ir.total },
];

// ── Resource IR → 体制行（職種別 人工・班日数）。 ──
export interface TradeRow { trade: string; labor: number; crewDays: number; }
export const resourceToRows: PresentationAdapter<ResourceIR, TradeRow[]> = (ir) =>
  ir.trades.map((t) => ({ trade: t.trade, labor: t.labor, crewDays: t.crewDays }));
