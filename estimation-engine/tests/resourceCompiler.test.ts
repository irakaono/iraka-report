// 甍AI Resource Compiler 自己テスト — 5つ目のドメインで一般性を確認。
//   アルゴリズム＝職種別集約＋班日数化。同じ DomainCompiler<K,IR> 契約・Program 注入・Execution read-only・evidence 貫通・決定的。
import { buildRoofModelFromFaces } from '../src/geometry/roofModel';
import type { DrainModel } from '../src/geometry/drainModel';
import { drainQuantities } from '../src/geometry/drainQuantities';
import { compileMaterials } from '../src/geometry/materialAdapter';
import { toExecution } from '../src/geometry/executionModel';
import { resourceCompile } from '../src/geometry/domainCompiler';
import type { DomainCompiler, ResourceIR } from '../src/geometry/domainCompiler';
import { resourceCompiler } from '../src/geometry/resourceCompiler';
import type { ResourceKnowledge } from '../src/geometry/resourceCompiler';
import { resourceToRows } from '../src/geometry/presentation';
import { defaultIntentCatalog, defaultProductCatalog, exampleResourceProgram } from '../src/geometry/materialCatalog';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

const attrs = { trade: '屋根工事', item: '屋根材' };
const scale = 50;
const roof = buildRoofModelFromFaces([
  { vertices: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }], pitch: 5, attrs, eaveEdgeIndex: 0 },
], { scale });
const eaveA = (roof.faces[0].slope.downhill as { toEdgeId: string }).toEdgeId;
// 軒樋(8m)+集水器(1)+竪樋(6m,e1)+排水(1) ＝全部 樋工
const drain: DrainModel = {
  schemaVersion: 1, id: 'DR', roofId: roof.id,
  runs: [{ id: 'gr1', eaveEdgeId: eaveA, flowDirection: 'left', drops: [{ id: 'd1', position: 0 }] }],
  graph: { nodes: [ { id: 'n1', kind: 'drop', point: { x: 0, y: 0 }, dropId: 'd1' }, { id: 'n2', kind: 'drain', point: { x: 0, y: 300 } } ], edges: [ { id: 'e1', from: 'n1', to: 'n2' } ] },
};
const exec = toExecution(compileMaterials(drainQuantities(roof, drain, scale), defaultIntentCatalog, defaultProductCatalog));

// ── 同じ契約 ──
const dc: DomainCompiler<ResourceKnowledge, ResourceIR> = resourceCompile;
const res = dc(exec, exampleResourceProgram);

// ── 職種別集約：全部 樋工。人工 = 軒樋8×0.03 + 集水器1×0.1 + 竪樋6×0.02 + 排水1×0.1 = 0.24+0.1+0.12+0.1 = 0.56 ──
const gutter = res.trades.find((t) => t.trade === '樋工')!;
ok(res.trades.length === 1 && gutter !== undefined, '職種は 樋工 1つに集約');
ok(near(gutter.labor, 0.56), '樋工 人工 = 0.56（4作業の合算）');
ok(near(res.totalLabor, 0.56), '総人工 = 0.56');
// ── 班日数 = 人工 / 班人数(2) ──
ok(gutter.crewSize === 2 && near(gutter.crewDays, 0.28), '樋工 班日数 = 0.56 / 2人 = 0.28');

// ── 機材：竪樋→脚立、軒樋→脚立+足場、排水→脚立 ──
ok(res.equipment.some((e) => e.name === '脚立') && res.equipment.some((e) => e.name === '足場'), '機材に 脚立・足場');
ok(res.equipment.find((e) => e.name === '脚立')!.count === 3, '脚立 = 竪樋+軒樋+排水 ＝3作業で必要');

// ── evidence 貫通：樖工の集約 evidence に Segment e1（竪樋）──
ok(gutter.evidence.some((e) => e.id === 'e1'), '体制の evidence が Segment e1 まで貫通');

// ── Program 差し替えで結果変化／Execution 不変 ──
const snap = JSON.stringify(exec);
const bigCrew: ResourceKnowledge = { ...exampleResourceProgram, crewSize: { ...exampleResourceProgram.crewSize, 樋工: 4 } };
const res2 = resourceCompile(exec, bigCrew);
ok(near(res2.trades.find((t) => t.trade === '樋工')!.crewDays, 0.56 / 4), '班人数 4人 → 班日数 0.14（Program 依存）');
ok(JSON.stringify(exec) === snap, 'Resource Compiler は Execution を書き換えない（read-only）');

// ── Presentation Adapter は IR を変えない ──
const rSnap = JSON.stringify(res);
const rows = resourceToRows(res);
ok(rows.length === res.trades.length && JSON.stringify(res) === rSnap, 'resourceToRows は IR を変えない');

// ── 決定的 ──
ok(JSON.stringify(resourceCompiler(exampleResourceProgram)(exec)) === JSON.stringify(res), 'Resource Compiler は決定的');

if (fails.length) {
  console.error(`❌ Resource Compiler test: ${fails.length} 失敗 / ${pass + fails.length} 中`);
  for (const f of fails) console.error('   - ' + f);
  process.exit(1);
}
console.log(`✅ Resource Compiler test: 全 ${pass} 件合格（5つ目のドメイン・職種集約+班日数・同じ契約・Program注入・read-only・evidence貫通）`);
