// 甍AI STEP6 縦切り実証 — 竪樋1系統：vertical_drain を Execution へ付属展開し、
//   同じ Execution から BOM Projection / Cost Projection / 発注表示 の【3つが一致】することを確認する。
//   ・付属展開：でんでん(ピッチ切上げ)・ジョイント(定尺継手)・接着剤(継手依存)・ビス(でんでん依存)。エルボは Graph 由来で展開しない。
//   ・evidence が竪樋の Segment(e1) まで貫通（ビス1本も幾何へ遡れる）。
import { buildRoofModelFromFaces } from '../src/geometry/roofModel';
import type { DrainModel } from '../src/geometry/drainModel';
import { drainQuantities } from '../src/geometry/drainQuantities';
import { compileMaterials } from '../src/geometry/materialAdapter';
import { toExecution } from '../src/geometry/executionModel';
import { bomProjection, costProjection } from '../src/geometry/projection';
import { defaultIntentCatalog, defaultProductCatalog, defaultAssemblyCatalog, examplePriceBook } from '../src/geometry/materialCatalog';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const attrs = { trade: '屋根工事', item: '屋根材' };
const scale = 50;
const roof = buildRoofModelFromFaces([
  { vertices: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }], pitch: 5, attrs, eaveEdgeIndex: 0 },
], { scale });
const eaveA = (roof.faces[0].slope.downhill as { toEdgeId: string }).toEdgeId;

// 竪樋1系統：縦Edge e1 = (0,0)→(0,300) ＝ 300px/50 = 6.0m
const drain: DrainModel = {
  schemaVersion: 1, id: 'DR', roofId: roof.id,
  runs: [{ id: 'gr1', eaveEdgeId: eaveA, flowDirection: 'left', drops: [{ id: 'd1', position: 0 }] }],
  graph: {
    nodes: [ { id: 'n1', kind: 'drop', point: { x: 0, y: 0 }, dropId: 'd1' }, { id: 'n2', kind: 'drain', point: { x: 0, y: 300 } } ],
    edges: [ { id: 'e1', from: 'n1', to: 'n2' } ],
  },
};

const dq = drainQuantities(roof, drain, scale);
const resolved = compileMaterials(dq, defaultIntentCatalog, defaultProductCatalog);
ok(resolved.find((m) => m.kind === 'vertical_drain')!.qty === 6, '竪樋 6.0m（縦Edge 300px/50）');

// ── Execution：付属展開（products 付き＝付属も Procurement 解決） ──
const exec = toExecution(resolved, defaultAssemblyCatalog, defaultProductCatalog);
const vd = exec.items.find((i) => i.kind === 'vertical_drain')!;
const main = vd.parts.find((p) => p.role === 'main')!;
const den = vd.parts.find((p) => p.kind === 'support_bracket')!;
const jnt = vd.parts.find((p) => p.kind === 'pipe_joint')!;
const adh = vd.parts.find((p) => p.kind === 'adhesive')!;
const bis = vd.parts.find((p) => p.kind === 'screw')!;

ok(main.product?.sku === 'PC50-60-BK' && near(main.qty, 6), '主部材 竪樋本体 6m（PC50-60-BK）');
ok(den.qty === 7 && den.product?.sku === 'PC50-DEN-BK', 'でんでん = ceil(6/0.9)=7個（製品解決 PC50-DEN-BK）');
ok(jnt.qty === 2 && jnt.product?.sku === 'PC50-JNT-60-BK', 'ジョイント = ceil(6/2.7)-1=2個');
ok(adh.qty === 2 && adh.product?.sku === 'PC50-ADH', '接着剤 = 継手2×1=2本（per_ancillary pipe_joint）');
ok(bis.qty === 14 && bis.product?.sku === 'PC50-SCR', 'ビス = でんでん7×2=14本（per_ancillary support_bracket）');
ok(!vd.parts.some((p) => p.kind === 'elbow'), 'エルボは付属展開しない（Graph 由来＝二重計上を避ける）');

// ── evidence 貫通：ビスまで竪樋の Segment(e1) に遡れる ──
ok(bis.product !== null && vd.evidence.some((e) => e.id === 'e1'), '付属(ビス)を含む item の evidence が Segment e1 まで貫通');

// ── 同じ Execution → BOM / Cost / 発注表示 が一致 ──
const bom = bomProjection(exec);
const cost = costProjection(examplePriceBook)(exec);
// (1) 竪樋系統の5部材（主＋付属4）が BOM に揃う
const drainSys = ['PC50-60-BK', 'PC50-DEN-BK', 'PC50-JNT-60-BK', 'PC50-ADH', 'PC50-SCR'];
ok(drainSys.every((sku) => bom.some((l) => l.sku === sku)), '竪樋系統の5部材(竪樋+でんでん+ジョイント+接着剤+ビス)が BOM に揃う');
const bomQ = (sku: string) => bom.find((l) => l.sku === sku)!.qty;
ok(bomQ('PC50-60-BK') === 6 && bomQ('PC50-DEN-BK') === 7 && bomQ('PC50-JNT-60-BK') === 2 && bomQ('PC50-ADH') === 2 && bomQ('PC50-SCR') === 14, 'BOM 数量が付属展開と一致');

// (2) Cost = BOM × 単価。行数・sku・数量は BOM と完全一致（＝発注表示と一致）
ok(cost.length === bom.length && cost.every((c, i) => c.sku === bom[i].sku && near(c.qty, bom[i].qty)), 'Cost の行/ sku / 数量が BOM と一致（＝発注表示と一致）');
const costOf = (sku: string) => cost.find((l) => l.sku === sku)!;
ok(near(costOf('PC50-60-BK').cost!, 6 * 1200), '竪樋 原価 6×1200=7200');
ok(near(costOf('PC50-DEN-BK').cost!, 7 * 180), 'でんでん 7×180=1260');
ok(near(costOf('PC50-JNT-60-BK').cost!, 2 * 220), 'ジョイント 2×220=440');
ok(near(costOf('PC50-ADH').cost!, 2 * 900), '接着剤 2×900=1800');
ok(near(costOf('PC50-SCR').cost!, 14 * 15), 'ビス 14×15=210');
const total = cost.filter((l) => l.sku && drainSys.includes(l.sku)).reduce((s, l) => s + (l.cost ?? 0), 0);
ok(near(total, 7200 + 1260 + 440 + 1800 + 210), `竪樋系統 合計原価 = 10910円（got ${total}）`);

// (3) 発注表示（BOM を name/qty/unit に整形）と Cost の同項目が一致
const order = bom.map((l) => ({ name: l.name, qty: l.qty, unit: l.unit }));
ok(order.every((o, i) => o.name === cost[i].name && near(o.qty, cost[i].qty) && o.unit === cost[i].unit), '発注表示 と Cost が同一（1つの Execution からの投影）');

// ── 純関数：決定的・入力不変 ──
const snap = JSON.stringify(resolved);
toExecution(resolved, defaultAssemblyCatalog, defaultProductCatalog);
ok(JSON.stringify(resolved) === snap, 'Execution 生成が Procurement 入力を破壊しない');
ok(JSON.stringify(bomProjection(exec)) === JSON.stringify(bom), 'BOM Projection は決定的');

if (fails.length) {
  console.error(`❌ Assembly Slice test: ${fails.length} 失敗 / ${pass + fails.length} 中`);
  for (const f of fails) console.error('   - ' + f);
  process.exit(1);
}
console.log(`✅ Assembly Slice test: 全 ${pass} 件合格（竪樋付属展開→ BOM/Cost/発注 一致・evidence 貫通）`);
