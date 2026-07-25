// 甍AI Cost Compiler 自己テスト — Execution 以降は【Domain Compiler】（Projection Runtime）である実証。
//   ・多段：材料費 → 労務費 → 間接費 → 見積（Estimate）。
//   ・Domain 知識（単価/歩掛/経費率）は注入するが Construction は足さない。Execution にしか依存しない（Compiler of Compilers）。
//   ・evidence が見積（材料行・労務行）から Geometry の Segment まで貫通。
import { buildRoofModelFromFaces } from '../src/geometry/roofModel';
import type { DrainModel } from '../src/geometry/drainModel';
import { drainQuantities } from '../src/geometry/drainQuantities';
import { compileMaterials } from '../src/geometry/materialAdapter';
import { toExecution } from '../src/geometry/executionModel';
import type { ExecutionModel } from '../src/geometry/executionModel';
import { costCompiler } from '../src/geometry/costCompiler';
import type { CostKnowledge } from '../src/geometry/costCompiler';
import { defaultIntentCatalog, defaultProductCatalog, defaultAssemblyCatalog, exampleCostKnowledge } from '../src/geometry/materialCatalog';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

const attrs = { trade: '屋根工事', item: '屋根材' };
const scale = 50;
const roof = buildRoofModelFromFaces([
  { vertices: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }], pitch: 5, attrs, eaveEdgeIndex: 0 },
], { scale });
const eaveA = (roof.faces[0].slope.downhill as { toEdgeId: string }).toEdgeId;
const drain: DrainModel = {
  schemaVersion: 1, id: 'DR', roofId: roof.id,
  runs: [{ id: 'gr1', eaveEdgeId: eaveA, flowDirection: 'left', drops: [{ id: 'd1', position: 0 }] }],
  graph: {
    nodes: [ { id: 'n1', kind: 'drop', point: { x: 0, y: 0 }, dropId: 'd1' }, { id: 'n2', kind: 'drain', point: { x: 0, y: 300 } } ],
    edges: [ { id: 'e1', from: 'n1', to: 'n2' } ],
  },
};
const dq = drainQuantities(roof, drain, scale);
const exec = toExecution(compileMaterials(dq, defaultIntentCatalog, defaultProductCatalog), defaultAssemblyCatalog, defaultProductCatalog);
const est = costCompiler(exampleCostKnowledge)(exec);

// ── 多段が組み上がる：材料＋労務＝直接、直接×率＝間接、直接＋間接＝合計 ──
ok(near(est.directCost, est.materialCost + est.laborCost), '直接費 = 材料費 + 労務費');
ok(near(est.indirectCost, est.directCost * 0.15), '間接費 = 直接費 × 経費率(0.15)');
ok(near(est.total, est.directCost + est.indirectCost), '合計 = 直接費 + 間接費');
ok(est.materialCost > 0 && est.laborCost > 0, '材料費・労務費が算出される');

// ── 段1 材料費：竪樋6m×1200 が材料行にある（BOM×単価） ──
const vdMat = est.materials.find((m) => m.sku === 'PC50-60-BK')!;
ok(near(vdMat.cost!, 6 * 1200), '材料費 段：竪樋 6×1200=7200');
// 付属（ビス）も材料費に含まれ、単価で計上される
ok(est.materials.some((m) => m.sku === 'PC50-SCR' && m.cost != null), '付属(ビス)も材料費に計上');

// ── 段2 労務費：竪樋 6m × 歩掛0.02人工/m × 20000円 = 2400円 ──
const vdLab = est.labor.find((l) => l.kind === 'vertical_drain')!;
ok(near(vdLab.labor, 6 * 0.02) && near(vdLab.cost, 6 * 0.02 * 20000), '労務費 段：竪樋 6×0.02人工×20000=2400');

// ── evidence 貫通：材料行・労務行が Geometry の Segment e1 まで遡れる ──
ok(vdMat.evidence.some((e) => e.id === 'e1'), '材料費 行の evidence が Segment e1 まで貫通');
ok(vdLab.evidence.some((e) => e.id === 'e1'), '労務費 行の evidence が Segment e1 まで貫通');

// ── Compiler of Compilers：Execution にしか依存しない（Geometry を渡さず、手組み Execution でも見積が出る） ──
const handExec: ExecutionModel = { items: [
  { operation: '竪樋取付', kind: 'vertical_drain', attrs: { diameter: 60 }, qty: 10, unit: 'm',
    parts: [{ product: { maker: 'X', series: 'X', sku: 'PC50-60-BK', name: '竪樋', unit: 'm' }, kind: 'vertical_drain', role: 'main', qty: 10, unit: 'm' }],
    evidence: [{ kind: 'segment', id: 'zz', contribution: 10 }] },
] };
const est2 = costCompiler(exampleCostKnowledge)(handExec);
ok(near(est2.materialCost, 10 * 1200) && near(est2.laborCost, 10 * 0.02 * 20000), '手組み Execution だけで見積が出る（Geometry 非依存＝業務Compilerの入力は Execution のみ）');

// ── Domain 知識の差し替えで見積が変わる／Execution は不変（Construction を足さない） ──
const cheap: CostKnowledge = { prices: { unitPrice: { 'PC50-60-BK': 600 } }, labor: { wagePerLabor: 20000, laborPerUnit: { vertical_drain: 0.02 } }, indirectRate: 0.1 };
const execSnap = JSON.stringify(exec);
const estCheap = costCompiler(cheap)(exec);
ok(estCheap.total !== est.total, 'Domain 知識（単価/率）差し替えで見積は変わる');
ok(JSON.stringify(exec) === execSnap, 'Cost Compiler は Execution を書き換えない（Construction を足さない）');

// ── 単価未設定は gap を surfaced（黙って0にしない） ──
const noPrice = costCompiler({ prices: { unitPrice: {} }, labor: exampleCostKnowledge.labor, indirectRate: 0.15 })(exec);
ok(noPrice.unresolvedSkus.length > 0 && noPrice.materialCost === 0, '単価表が空→材料費0＋未解決skuを surfaced（gap 可視化）');

// ── 決定的 ──
ok(JSON.stringify(costCompiler(exampleCostKnowledge)(exec)) === JSON.stringify(est), 'Cost Compiler は決定的');

if (fails.length) {
  console.error(`❌ Cost Compiler test: ${fails.length} 失敗 / ${pass + fails.length} 中`);
  for (const f of fails) console.error('   - ' + f);
  process.exit(1);
}
console.log(`✅ Cost Compiler test: 全 ${pass} 件合格（Execution→材料→労務→間接→見積・Domain知識のみ注入・Execution非依存で成立・evidence貫通）`);
