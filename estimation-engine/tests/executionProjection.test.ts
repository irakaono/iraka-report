// 甍AI Execution Model / Projection 自己テスト — 第2境界（施工↔業務）。
//   ・Compiler は Execution で終わる。Cost/BOM は Execution からの Projection（construction を足さない）。
//   ・Execution は canonical だが派生（保存しない）。evidence は Geometry→Execution→Projection を貫通。
//   ・付属部材(Assembly)は per 倍で展開・付属の製品解決は JIT（今は主部材のみ faithful）。
import { buildRoofModelFromFaces } from '../src/geometry/roofModel';
import type { DrainModel } from '../src/geometry/drainModel';
import { drainQuantities } from '../src/geometry/drainQuantities';
import { roofQuantities } from '../src/geometry/roofQuantities';
import { compileMaterials, compileExecution } from '../src/geometry/materialAdapter';
import { toExecution } from '../src/geometry/executionModel';
import type { AssemblyCatalog } from '../src/geometry/executionModel';
import { bomProjection, costProjection, orderEvidenceOf } from '../src/geometry/projection';
import type { ResolvedMaterial } from '../src/geometry/productCatalog';
import { defaultIntentCatalog, defaultProductCatalog } from '../src/geometry/materialCatalog';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const attrs = { trade: '屋根工事', item: '屋根材' };
const scale = 50;
const roof = buildRoofModelFromFaces([
  { vertices: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }], pitch: 5, attrs, eaveEdgeIndex: 0 },
  { vertices: [{ x: 0, y: 300 }, { x: 400, y: 300 }, { x: 400, y: 600 }, { x: 0, y: 600 }], pitch: 5, attrs, eaveEdgeIndex: 2 },
], { scale });
const eaveA = (roof.faces[0].slope.downhill as { toEdgeId: string }).toEdgeId;
const drain: DrainModel = {
  schemaVersion: 1, id: 'DR', roofId: roof.id,
  runs: [{ id: 'gr1', eaveEdgeId: eaveA, flowDirection: 'both', drops: [{ id: 'd1', position: 0.5 }] }],
  graph: {
    nodes: [
      { id: 'n1', kind: 'drop',  point: { x: 0,   y: 0 },   dropId: 'd1' },
      { id: 'n2', kind: 'elbow', point: { x: 0,   y: 150 } },
      { id: 'n3', kind: 'drain', point: { x: 100, y: 150 } },
    ],
    edges: [ { id: 'e1', from: 'n1', to: 'n2' }, { id: 'e2', from: 'n2', to: 'n3' } ],
  },
};
const dq = drainQuantities(roof, drain, scale);
const rq = roofQuantities(roof, scale);
const resolved = compileMaterials(dq, defaultIntentCatalog, defaultProductCatalog);

// ── Execution：Procurement → 実行計画（pass-through：主部材のみ） ──
const exec = toExecution(resolved);
ok(exec.items.length === resolved.length, 'Execution item 数 = Procurement 行数（pass-through）');
const vdItem = exec.items.find((i) => i.kind === 'vertical_drain')!;
ok(vdItem.operation === '竪樋取付', 'kind から既定操作名（竪樋取付）');
ok(vdItem.parts.length === 1 && vdItem.parts[0].role === 'main' && vdItem.parts[0].product?.sku === 'PC50-60-BK', '付属Knowledge無し→主部材のみ');
ok(vdItem.evidence.some((e) => e.id === 'e1') && near(vdItem.qty, 3), 'evidence(e1)と量が Execution まで貫通');

// ── Assembly：付属部材の展開（per 倍。※例示ルール＝甍Knowledgeは別途） ──
const assembly: AssemblyCatalog = { id: 'asm-example', rules: [
  { when: { kind: 'vertical_drain' }, operation: '竪樋取付', ancillaries: [ { kind: 'support_bracket', label: 'でんでん', unit: '個', basis: 'per_main', factor: 0.6 } ] },
] };
const execA = toExecution(resolved, assembly);
const vdA = execA.items.find((i) => i.kind === 'vertical_drain')!;
ok(vdA.parts.length === 2 && vdA.parts[1].role === 'ancillary' && vdA.parts[1].label === 'でんでん', '付属部材が主部材に追加される');
ok(near(vdA.parts[1].qty, vdA.qty * 0.6), '付属量 = 主部材量 × factor（per_main）');
ok(vdA.parts[1].product === null, 'products を渡さない→付属の製品は null（解決は products 付き toExecution で）');

// ── BOM Projection：全 part を sku ごとに集約・未解決は surfaced ──
const buildingExec = compileExecution([...rq, ...dq], defaultIntentCatalog, defaultProductCatalog);
const bom = bomProjection(buildingExec);
ok(bom.some((l) => l.sku === 'PC50-60-BK' && l.maker === 'Panasonic'), '発注に竪樋(PC50-60-BK)');
ok(bom.some((l) => l.sku === null && l.kind === 'roof_field'), '屋根(未解決)は sku=null で発注に surfaced（黙って落とさない）');
// 集約：同 sku の2行が1行にまとまり量が合算される
const twoVd: ResolvedMaterial[] = [
  { kind: 'vertical_drain', attrs: { diameter: 60 }, qty: 3, unit: 'm', product: { maker: 'Panasonic', series: 'PC50', sku: 'PC50-60-BK', name: '丸竪樋 φ60 ブラック', unit: 'm' }, evidence: [{ kind: 'segment', id: 'e1', contribution: 3 }] },
  { kind: 'vertical_drain', attrs: { diameter: 60 }, qty: 4, unit: 'm', product: { maker: 'Panasonic', series: 'PC50', sku: 'PC50-60-BK', name: '丸竪樋 φ60 ブラック', unit: 'm' }, evidence: [{ kind: 'segment', id: 'e9', contribution: 4 }] },
];
const bom2 = bomProjection(toExecution(twoVd));
ok(bom2.length === 1 && near(bom2[0].qty, 7) && bom2[0].evidence.length === 2, '同 sku は1発注行に集約（3+4=7m・evidence 2件）');

// ── Cost Projection：BOM × 単価。単価不明は cost=null で gap を surfaced ──
const noPrice = costProjection()(buildingExec);
ok(noPrice.every((l) => l.cost === null && l.unitPrice === null), '単価未設定→ cost=null（gap を surfaced）');
const priced = costProjection({ unitPrice: { 'PC50-60-BK': 1200 } })(toExecution(twoVd));
ok(priced.length === 1 && near(priced[0].cost!, 7 * 1200), '単価あり→ cost = 量 × 単価（7×1200）');

// ── 逆引き（要素→発注行） ──
ok(orderEvidenceOf(bom, 'e1').some((l) => l.sku === 'PC50-60-BK'), '要素 e1 → 竪樋の発注行を逆引き');

// ── 純関数：入力不変・決定的 ──
const snap = JSON.stringify(resolved);
compileExecution(dq, defaultIntentCatalog, defaultProductCatalog);
ok(JSON.stringify(resolved) === snap, 'Procurement 入力を破壊しない');
ok(JSON.stringify(bomProjection(buildingExec)) === JSON.stringify(bomProjection(buildingExec)), 'Projection は決定的');

if (fails.length) {
  console.error(`❌ Execution/Projection test: ${fails.length} 失敗 / ${pass + fails.length} 中`);
  for (const f of fails) console.error('   - ' + f);
  process.exit(1);
}
console.log(`✅ Execution/Projection test: 全 ${pass} 件合格（Compiler は Execution で終わる・Cost/BOM は Projection・evidence 貫通）`);
