// 甍AI Schedule Compiler 自己テスト — 契約の一般化可能性の証明。
//   Cost（足し算）と全く違うIR（Task Graph + Critical Path）が、同じ DomainCompiler<K,IR> 契約に収まることを実証。
//   ・Domain Program（順序制約/工数）のみ注入・Construction 不変・Execution read-only・evidence 貫通・決定的。
import { buildRoofModelFromFaces } from '../src/geometry/roofModel';
import type { DrainModel } from '../src/geometry/drainModel';
import { drainQuantities } from '../src/geometry/drainQuantities';
import { compileMaterials } from '../src/geometry/materialAdapter';
import { toExecution } from '../src/geometry/executionModel';
import { scheduleCompile } from '../src/geometry/domainCompiler';
import type { DomainCompiler, ScheduleIR } from '../src/geometry/domainCompiler';
import { scheduleCompiler } from '../src/geometry/scheduleCompiler';
import type { ScheduleKnowledge } from '../src/geometry/scheduleCompiler';
import { taskGraphToRows } from '../src/geometry/presentation';
import { defaultIntentCatalog, defaultProductCatalog, exampleScheduleKnowledge } from '../src/geometry/materialCatalog';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

const attrs = { trade: '屋根工事', item: '屋根材' };
const scale = 50;
const roof = buildRoofModelFromFaces([
  { vertices: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }], pitch: 5, attrs, eaveEdgeIndex: 0 },
], { scale });
const eaveA = (roof.faces[0].slope.downhill as { toEdgeId: string }).toEdgeId;
// 軒樋(8m) + 集水器(1) + 竪樋(6m, e1) + 排水(1)
const drain: DrainModel = {
  schemaVersion: 1, id: 'DR', roofId: roof.id,
  runs: [{ id: 'gr1', eaveEdgeId: eaveA, flowDirection: 'left', drops: [{ id: 'd1', position: 0 }] }],
  graph: { nodes: [ { id: 'n1', kind: 'drop', point: { x: 0, y: 0 }, dropId: 'd1' }, { id: 'n2', kind: 'drain', point: { x: 0, y: 300 } } ], edges: [ { id: 'e1', from: 'n1', to: 'n2' } ] },
};
const exec = toExecution(compileMaterials(drainQuantities(roof, drain, scale), defaultIntentCatalog, defaultProductCatalog));

// ── 同じ DomainCompiler<K,IR> 契約に収まる（コンパイル時） ──
const dc: DomainCompiler<ScheduleKnowledge, ScheduleIR> = scheduleCompile;
const tg = dc(exec, exampleScheduleKnowledge);
ok(tg.tasks.length === exec.items.length, 'Task 数 = Execution item 数（1 item = 1 タスク）');

const task = (kind: string) => tg.tasks.find((t) => t.kind === kind)!;
// ── 工数：量 × 工数原単位（Program） ──
ok(near(task('vertical_drain').duration, 6 * 0.02), '竪樋 工数 = 6m × 0.02 = 0.12人日');
ok(near(task('eave_gutter').duration, 8 * 0.03), '軒樋 工数 = 8m × 0.03 = 0.24人日');

// ── 依存（precedence Program）：竪樋は 軒樋・集水器 の後 ──
const vd = task('vertical_drain');
ok(vd.deps.includes(task('eave_gutter').id) && vd.deps.includes(task('outlet').id), '竪樋タスクは 軒樋・集水器 に依存');
ok(task('drain_outlet').deps.includes(vd.id), '排水タスクは 竪樋 に依存');

// ── CPM：ES/EF とクリティカルパス ──
// 軒樋0.24 → 竪樋(ES0.24,EF0.36) → 排水(EF0.46)。集水器0.1 は非クリティカル。
ok(near(vd.earliestStart, 0.24) && near(vd.earliestFinish, 0.36), '竪樋 ES=0.24 EF=0.36（軒樋0.24 の後）');
ok(near(tg.totalDuration, 0.46), '総工期 = 0.46人日（軒樋→竪樋→排水）');
ok(tg.criticalPath.join(',') === [task('eave_gutter').id, vd.id, task('drain_outlet').id].join(','), 'クリティカルパス = 軒樋→竪樋→排水');
ok(task('outlet').critical === false, '集水器は非クリティカル（float>0）');

// ── evidence 貫通：竪樋タスク → Segment e1 ──
ok(vd.evidence.some((e) => e.id === 'e1'), '工程タスクの evidence が Segment e1 まで貫通');

// ── Program 差し替えで工程が変わる／Execution 不変（Construction を足さない） ──
const fast: ScheduleKnowledge = { durationPerUnit: { eave_gutter: 0, outlet: 0, vertical_drain: 0.01, drain_outlet: 0 }, precedence: exampleScheduleKnowledge.precedence };
const snap = JSON.stringify(exec);
const tgFast = scheduleCompile(exec, fast);
ok(!near(tgFast.totalDuration, tg.totalDuration), 'Program（工数）差し替えで総工期が変わる');
ok(JSON.stringify(exec) === snap, 'Schedule Compiler は Execution を書き換えない（read-only）');

// ── Presentation Adapter（同じ形）：Task Graph IR を変えない ──
const tgSnap = JSON.stringify(tg);
const rows = taskGraphToRows(tg);
ok(rows.length === tg.tasks.length && JSON.stringify(tg) === tgSnap, 'taskGraphToRows は IR を変えない（読むだけ）');
ok(rows.some((r) => r.critical && r.operation === '竪樋取付'), '工程行にクリティカル印（竪樋取付）');

// ── 決定的 ──
ok(JSON.stringify(scheduleCompiler(exampleScheduleKnowledge)(exec)) === JSON.stringify(tg), 'Schedule Compiler は決定的');

if (fails.length) {
  console.error(`❌ Schedule Compiler test: ${fails.length} 失敗 / ${pass + fails.length} 中`);
  for (const f of fails) console.error('   - ' + f);
  process.exit(1);
}
console.log(`✅ Schedule Compiler test: 全 ${pass} 件合格（Cost と同じ契約・違うIR=Task Graph+CPM・Program注入・Execution read-only・evidence貫通）`);
