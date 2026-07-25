// 甍AI Domain IR / Presentation Adapter 自己テスト — 4層目（Domain IR → Presentation）。
//   ・DomainCompiler = Execution + Knowledge → Domain IR（Cost）。BOM は Identity（Knowledge不要）。
//   ・Presentation Adapter は Domain IR を【読むだけ】：1 IR → 複数 Adapter、IR を変えない、evidence は IR に残る。
//   ・「Export は存在しない」＝ Presentation Adapter。
import { buildRoofModelFromFaces } from '../src/geometry/roofModel';
import type { DrainModel } from '../src/geometry/drainModel';
import { drainQuantities } from '../src/geometry/drainQuantities';
import { compileMaterials } from '../src/geometry/materialAdapter';
import { toExecution } from '../src/geometry/executionModel';
import { costCompile, bomCompile } from '../src/geometry/domainCompiler';
import type { DomainCompiler, IdentityCompiler, EstimateIR, OrderIR } from '../src/geometry/domainCompiler';
import { estimateToRows, estimateToCsv, orderToCsv } from '../src/geometry/presentation';
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
  graph: { nodes: [ { id: 'n1', kind: 'drop', point: { x: 0, y: 0 }, dropId: 'd1' }, { id: 'n2', kind: 'drain', point: { x: 0, y: 300 } } ], edges: [ { id: 'e1', from: 'n1', to: 'n2' } ] },
};
const exec = toExecution(compileMaterials(drainQuantities(roof, drain, scale), defaultIntentCatalog, defaultProductCatalog), defaultAssemblyCatalog, defaultProductCatalog);

// ── DomainCompiler：Execution + Knowledge → Domain IR ──
const dc: DomainCompiler<CostKnowledge, EstimateIR> = costCompile; // 一般契約に適合（コンパイル時）
const ir: EstimateIR = dc(exec, exampleCostKnowledge);
ok(ir.materialCost > 0 && ir.laborCost > 0 && ir.total > 0, 'Cost DomainCompiler が Estimate IR を返す');
ok(Array.isArray(ir.materials) && Array.isArray(ir.labor), 'Estimate IR は原価構造（材料/労務）を保持');

// ── BOM は Identity Compiler（Knowledge 不要） ──
const idc: IdentityCompiler<OrderIR> = bomCompile;
const order: OrderIR = idc(exec);
ok(order.lines.length > 0 && order.lines.some((l) => l.sku === 'PC50-60-BK'), 'BOM Identity Compiler が Order IR を返す（Knowledge不要）');

// ── Presentation Adapter：1 IR → 複数 Adapter ──
const rows = estimateToRows(ir);
ok(rows.length === 4 && rows[3].label === '合計' && near(rows[3].amount, ir.total), 'estimateToRows：合計が IR と一致');
ok(near(rows[0].amount, ir.materialCost), 'estimateToRows：材料費が IR と一致');
const csv = estimateToCsv(ir);
ok(csv.includes('合計') && csv.includes(String(ir.total)), 'estimateToCsv：合計金額を含む');
ok(csv.includes('材料') && csv.includes('労務'), 'estimateToCsv：材料/労務 内訳を含む');
const ocsv = orderToCsv(order);
ok(ocsv.includes('PC50-60-BK'), 'orderToCsv：発注に竪樋 sku を含む');

// ── 不変条件：Presentation Adapter は Domain IR を変えない ──
const snap = JSON.stringify(ir);
estimateToRows(ir); estimateToCsv(ir); // 複数 Adapter を通す
ok(JSON.stringify(ir) === snap, 'Adapter は Domain IR を書き換えない（読むだけ）');

// ── evidence は Domain IR に残る（表示は lossy 可・IR は保持） ──
const vdMat = ir.materials.find((m) => m.sku === 'PC50-60-BK')!;
ok(vdMat.evidence.some((e) => e.id === 'e1'), 'Estimate IR は evidence を保持（見積→Segment e1）');

// ── 複数 Presentation が同じ IR から整合 ──
ok(near(rows[3].amount, ir.total) && csv.trim().endsWith(String(ir.total)), 'rows と csv は同じ IR から一致（1 IR → 複数 Adapter）');

// ── 決定的 ──
ok(JSON.stringify(costCompile(exec, exampleCostKnowledge)) === JSON.stringify(ir), 'DomainCompiler は決定的');

if (fails.length) {
  console.error(`❌ Presentation/DomainIR test: ${fails.length} 失敗 / ${pass + fails.length} 中`);
  for (const f of fails) console.error('   - ' + f);
  process.exit(1);
}
console.log(`✅ Presentation/DomainIR test: 全 ${pass} 件合格（DomainCompiler→Domain IR→Presentation Adapter・IR不変・evidence保持・Export=Adapter）`);
