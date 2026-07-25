// 甍AI QA(Rule Engine) / Carbon(多段集約) Compiler 自己テスト — 契約のアルゴリズム中立を積み重ねる。
//   4ドメイン＝Cost(Reduction)/Schedule(Graph+CPM)/QA(Rule Engine)/Carbon(多段集約) が同じ DomainCompiler<K,IR> に収まる。
//   各：Program のみ注入・Construction 不変・Execution read-only・evidence 貫通・決定的。
import { buildRoofModelFromFaces } from '../src/geometry/roofModel';
import type { DrainModel } from '../src/geometry/drainModel';
import { drainQuantities } from '../src/geometry/drainQuantities';
import { compileMaterials } from '../src/geometry/materialAdapter';
import { toExecution } from '../src/geometry/executionModel';
import { qaCompile, carbonCompile } from '../src/geometry/domainCompiler';
import type { DomainCompiler } from '../src/geometry/domainCompiler';
import { qaCompiler } from '../src/geometry/qaCompiler';
import type { QAKnowledge, InspectionIR } from '../src/geometry/qaCompiler';
import { carbonCompiler } from '../src/geometry/carbonCompiler';
import type { CarbonKnowledge, CarbonIR } from '../src/geometry/carbonCompiler';
import { inspectionToRows, carbonToRows } from '../src/geometry/presentation';
import { defaultIntentCatalog, defaultProductCatalog, defaultAssemblyCatalog, exampleQAProgram, exampleCarbonProgram } from '../src/geometry/materialCatalog';

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

// ═══════════ QA ＝ Rule Engine（述語評価） ═══════════
const qadc: DomainCompiler<QAKnowledge, InspectionIR> = qaCompile;
const insp = qadc(exec, exampleQAProgram);
ok(insp.checks.length === 3, 'QA：3規則を評価');
ok(insp.checks.find((c) => c.id === 'outlet-min')!.pass === true, '集水器1個以上 → pass（actual 1）');
ok(insp.checks.find((c) => c.id === 'drain-min')!.pass === true, '排水1個以上 → pass');
ok(insp.checks.find((c) => c.id === 'downspout-max')!.actual === 6 && insp.checks.find((c) => c.id === 'downspout-max')!.pass === true, '竪樋 6m ≤ 30m → pass');
ok(insp.allPass === true && insp.failCount === 0, 'QA：全 pass');
// 失敗検出＋severity（厳しい規則で fail を出す）
const strict: QAKnowledge = { rules: [{ id: 'ds-strict', label: '竪樋 3m以下', kind: 'vertical_drain', metric: 'kind_total_qty', op: '<=', threshold: 3, severity: 'error' }] };
const inspF = qaCompiler(strict)(exec);
ok(inspF.failCount === 1 && inspF.checks[0].pass === false && inspF.checks[0].severity === 'error', 'QA：閾値超で fail（error）を検出');
// evidence 貫通：竪樋規則 → Segment e1
ok(insp.checks.find((c) => c.id === 'downspout-max')!.evidence.some((e) => e.id === 'e1'), 'QA：検査の evidence が Segment e1 まで貫通');

// ═══════════ Carbon ＝ 多段集約（材料→輸送→施工） ═══════════
const cdc: DomainCompiler<CarbonKnowledge, CarbonIR> = carbonCompile;
const carbon = cdc(exec, exampleCarbonProgram);
ok(near(carbon.transportCO2, carbon.materialCO2 * 0.1), '輸送CO₂ = 材料CO₂ × 0.1');
ok(near(carbon.total, carbon.materialCO2 + carbon.transportCO2 + carbon.constructionCO2), '合計 = 材料+輸送+施工');
ok(carbon.materialCO2 > 0 && carbon.constructionCO2 > 0, '材料/施工 CO₂ が算出');
// 材料段：竪樋 6m × 2.5 = 15
const vdCarbon = carbon.materialLines.find((l) => l.sku === 'PC50-60-BK')!;
ok(near(vdCarbon.co2, 6 * 2.5), '材料CO₂ 段：竪樋 6×2.5=15');
ok(vdCarbon.evidence.some((e) => e.id === 'e1'), 'Carbon：材料行の evidence が Segment e1 まで貫通');

// ═══════════ 共通不変条件（両ドメイン） ═══════════
const snap = JSON.stringify(exec);
qaCompile(exec, exampleQAProgram); carbonCompile(exec, exampleCarbonProgram);
ok(JSON.stringify(exec) === snap, 'QA/Carbon は Execution を書き換えない（read-only）');
// Program 差し替えで結果変化
ok(carbonCompiler({ co2PerUnit: {}, transportRate: 0, constructionCO2PerUnit: {} })(exec).total === 0, 'Carbon：Program 空→ CO₂ 0（Program 依存）');
// Presentation Adapter は IR を変えない
const iSnap = JSON.stringify(insp); const cSnap = JSON.stringify(carbon);
inspectionToRows(insp); carbonToRows(carbon);
ok(JSON.stringify(insp) === iSnap && JSON.stringify(carbon) === cSnap, 'Presentation Adapter は IR を変えない');
ok(inspectionToRows(insp).length === 3 && carbonToRows(carbon).length === 4, 'inspection/carbon の Presentation 行');
// 決定的
ok(JSON.stringify(qaCompile(exec, exampleQAProgram)) === JSON.stringify(insp), 'QA 決定的');
ok(JSON.stringify(carbonCompile(exec, exampleCarbonProgram)) === JSON.stringify(carbon), 'Carbon 決定的');

if (fails.length) {
  console.error(`❌ QA/Carbon Compiler test: ${fails.length} 失敗 / ${pass + fails.length} 中`);
  for (const f of fails) console.error('   - ' + f);
  process.exit(1);
}
console.log(`✅ QA/Carbon Compiler test: 全 ${pass} 件合格（Rule Engine と 多段集約 が同じ契約・Program注入・read-only・evidence貫通）`);
