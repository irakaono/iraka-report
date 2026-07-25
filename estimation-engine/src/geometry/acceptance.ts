// 甍AI Drawing Intelligence Acceptance ハーネス。
//   目的：図面→Geometry→Quantity の精度を cases.json で定量評価する。Program は既知・決定的として扱う。
//   ★このモジュールは「人トレース」でも「Recognizer」でも同一契約。source/confidence が変わるだけ（差し替えて同じ指標で比較できる）。
//   ロック済み方針（claude/ACCEPTANCE-drawing-intelligence.md）:
//     - 辺ごと内訳ログ（source/confidence 付き）を残す＝どの辺を間違えたか追える／将来の教師データ。
//     - Program は Quantity→Estimate だけを見る。Geometry には触れない。
//     - トレランス：長さ max(0.1m,1%)（Phase A 人トレース）／個数は完全一致／見積は決定的なので完全一致。
//     - 原則：Acceptance の閾値は Ground Truth(cases.json) の測定粒度を超えてはならない。
import type { QuantityResult } from './roofModel';

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

// ───────────────────────── ② 辺ごと内訳ログ ─────────────────────────
export type QuantitySource = 'manual' | 'recognizer';

export interface BreakdownRow {
  refId: string;          // 根拠要素 id（edge/drop/node/segment）＝evidence.id。クリックでハイライトも可。
  role: string;           // 数量の種類（gutterLength/eave 等）
  value: number;          // その要素の寄与（m / 個）
  source: QuantitySource; // 誰が Geometry を作ったか。manual→将来 recognizer に差し替え。
  confidence: number;     // 0..1。manual=1.0、recognizer=推定確信度。
}

export interface QuantityBreakdown {
  key: string; label: string; unit: string; total: number;
  rows: BreakdownRow[];
}

// QuantityResult[]（evidence 付き）→ 辺ごと内訳ログ。source/confidence を付与（契約はそのまま）。
export function buildBreakdown(
  quantities: QuantityResult[], source: QuantitySource = 'manual', confidence = 1.0,
): QuantityBreakdown[] {
  return quantities.map((q) => ({
    key: q.key, label: q.label, unit: q.unit, total: round3(q.value),
    rows: q.evidence.map((e) => ({ refId: e.id, role: q.key, value: round3(e.contribution), source, confidence })),
  }));
}

// 内訳ログを人が読めるテキストに（edgeId / role / length … / total）。
export function formatBreakdown(b: QuantityBreakdown): string {
  const head = `${b.label}（${b.key}）`;
  const rows = b.rows.map((r) => `  ${r.refId}\trole=${r.role}\t${r.value}${b.unit}\t[${r.source} ${r.confidence}]`);
  return [head, ...rows, `  ${'-'.repeat(24)}`, `  total\t${b.total}${b.unit}`].join('\n');
}

// ───────────────────────── ③ Program（Quantity → Estimate。Geometry には触れない） ─────────────────────────
export interface ProgramLineSpec {
  quantityKey: string;  // どの Quantity を使うか（gutterLength/outletCount/downspoutLength）
  name: string;         // 見積の品名（cases.json と突き合わせる名前）
  unit: string;
  unitPrice: number;
}
export interface GutterProgram {
  client: string;
  domain: string;
  taxRate: number;
  lines: ProgramLineSpec[];
}
export interface EstimateLine {
  quantityKey: string; name: string; qty: number; unit: string; unitPrice: number; amount: number;
}
export interface Estimate {
  lines: EstimateLine[]; overhead: number; subtotal: number; tax: number; total: number;
}

// Quantity + Program(+諸経費) → 見積。金額は cases.json の丸めに合わせ round。
export function applyGutterProgram(quantities: QuantityResult[], program: GutterProgram, overhead: number): Estimate {
  const qmap = new Map(quantities.map((q) => [q.key, q.value]));
  const lines: EstimateLine[] = program.lines.map((spec) => {
    const qty = round3(qmap.get(spec.quantityKey) ?? 0);
    return { quantityKey: spec.quantityKey, name: spec.name, qty, unit: spec.unit, unitPrice: spec.unitPrice, amount: Math.round(qty * spec.unitPrice) };
  });
  const linesSum = lines.reduce((a, l) => a + l.amount, 0);
  const subtotal = linesSum + overhead;
  const tax = Math.round(subtotal * program.taxRate);
  return { lines, overhead, subtotal, tax, total: subtotal + tax };
}

// ───────────────────────── ④ Δ レポート（判定理由まで残す） ─────────────────────────
export type Verdict = 'PASS' | 'FAIL';
export interface DeltaRow {
  level: 'L2' | 'L3';
  key: string; label: string; unit: string;
  engine: number; cases: number; delta: number;
  threshold: string; allowed: number; actual: number;
  verdict: Verdict;
}

const isCountUnit = (unit: string): boolean => unit === '個' || unit === 'ヶ所' || unit === '本';

// cases.json の雨樋明細を role（＝quantityKey）に分類。品名の表記ゆれ・製品差に強くする。
export function classifyGutterItem(name: string): string | null {
  if (/軒とい|軒樋/.test(name)) return 'gutterLength';
  if (/集水器/.test(name)) return 'outletCount';
  if (/たてとい|竪樋|縦樋/.test(name)) return 'downspoutLength';
  return null; // 諸経費 / はいとい / Ｐマス 等は Quantity 対象外（別扱い）
}

// L2：Quantity vs cases.json。長さ=max(0.1m,1%)、個数=完全一致。allowed は Ground Truth 粒度(0.1m)を下回らない。
export function judgeQuantity(key: string, label: string, unit: string, engine: number, cases: number): DeltaRow {
  const delta = round3(engine - cases);
  const actual = round3(Math.abs(delta));
  const count = isCountUnit(unit);
  const allowed = count ? 0 : round3(Math.max(0.1, 0.01 * Math.abs(cases)));
  const threshold = count ? '完全一致' : 'max(0.1m, 1%)';
  return { level: 'L2', key, label, unit, engine: round3(engine), cases: round3(cases), delta, threshold, allowed, actual, verdict: actual <= allowed ? 'PASS' : 'FAIL' };
}

// L3：見積（金額）は決定的なので完全一致。
export function judgeExact(level: 'L3', key: string, label: string, unit: string, engine: number, cases: number): DeltaRow {
  const delta = round3(engine - cases);
  const actual = round3(Math.abs(delta));
  return { level, key, label, unit, engine: round3(engine), cases: round3(cases), delta, threshold: '完全一致', allowed: 0, actual, verdict: actual === 0 ? 'PASS' : 'FAIL' };
}

// cases.json の1棟の gutter（または roof）ブロック。
export interface CaseWorkItem { name: string; qty: number; unit: string; unitPrice: number; amount: number; note?: string }
export interface CaseWork { total: number; subtotal: number; tax: number; items: CaseWorkItem[] }

export interface AcceptanceReport {
  caseId: string;
  domain: string;
  breakdown: QuantityBreakdown[];
  estimate: Estimate;
  l2: DeltaRow[];   // Quantity 一致
  l3: DeltaRow[];   // 見積 一致（明細＋小計＋合計）
  passed: boolean;  // 全 PASS か
}

// フル Acceptance：Quantity（内訳ログ）→ Program 適用 → cases.json と L2/L3 で照合。
//   caseWork: cases.json の該当 domain（gutter 等）。overhead: 諸経費（cases の該当行金額を渡す＝既知入力）。
export function runAcceptance(args: {
  caseId: string; domain: string;
  quantities: QuantityResult[]; program: GutterProgram; caseWork: CaseWork; overhead: number;
  source?: QuantitySource; confidence?: number;
}): AcceptanceReport {
  const { caseId, domain, quantities, program, caseWork, overhead, source = 'manual', confidence = 1.0 } = args;
  const breakdown = buildBreakdown(quantities, source, confidence);
  const estimate = applyGutterProgram(quantities, program, overhead);
  const qmap = new Map(quantities.map((q) => [q.key, q]));
  // cases.json の明細を quantityKey に role で対応づける（品名の表記ゆれ NF-1/NF-I や製品差に強い）。
  const caseByKey = new Map<string, CaseWorkItem>();
  for (const it of caseWork.items) { const k = classifyGutterItem(it.name); if (k && !caseByKey.has(k)) caseByKey.set(k, it); }

  const l2: DeltaRow[] = [];
  const l3: DeltaRow[] = [];
  for (const spec of program.lines) {
    const q = qmap.get(spec.quantityKey);
    const ci = caseByKey.get(spec.quantityKey);
    const engineQty = q ? q.value : 0;
    const casesQty = ci ? ci.qty : 0;
    l2.push(judgeQuantity(spec.quantityKey, spec.name, spec.unit, engineQty, casesQty));
    const engineLine = estimate.lines.find((l) => l.quantityKey === spec.quantityKey);
    l3.push(judgeExact('L3', spec.quantityKey, spec.name + '（金額）', '円', engineLine ? engineLine.amount : 0, ci ? ci.amount : 0));
  }
  // 小計・合計（諸経費含む）も L3 で照合。
  l3.push(judgeExact('L3', 'subtotal', '小計', '円', estimate.subtotal, caseWork.subtotal));
  l3.push(judgeExact('L3', 'total', '合計', '円', estimate.total, caseWork.total));

  const passed = [...l2, ...l3].every((r) => r.verdict === 'PASS');
  return { caseId, domain, breakdown, estimate, l2, l3, passed };
}

// レポートを人が読めるテキストに。
export function formatReport(r: AcceptanceReport): string {
  const line = (d: DeltaRow) =>
    `[${d.verdict}] ${d.level} ${d.label}: engine=${d.engine}${d.unit} cases=${d.cases}${d.unit} Δ=${d.delta}${d.unit} | threshold=${d.threshold} allowed=${d.allowed} actual=${d.actual}`;
  return [
    `=== Acceptance: ${r.caseId} / ${r.domain} === ${r.passed ? 'ALL PASS' : 'FAIL あり'}`,
    '--- L2 Quantity ---', ...r.l2.map(line),
    '--- L3 Estimate ---', ...r.l3.map(line),
  ].join('\n');
}
