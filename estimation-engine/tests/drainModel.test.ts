// 甍AI Drain Model 自己テスト（v0.2 Graph）— 雨樋は Roof の【兄弟モデル】。
//   軒樋：配置(Evidence: drops) → Flow(gutterFlow) → Quantity。both は drops で中央/両端を区別。
//   排水経路：Node/Edge Graph が唯一の真実。Segment(=Edge) の向きから 竪樋/呼び樋 を派生（部材名を保存しない）。
//   さらに Drain Drawing（射影）も検証（Roof を参照して作図・屋根変更→雨樋だけ再投影）。
import { buildRoofModelFromFaces } from '../src/geometry/roofModel';
import { gutterFlow, dropPoint, emptyDrainModel, segmentKind } from '../src/geometry/drainModel';
import type { DrainModel, GutterRun, DrainGraph } from '../src/geometry/drainModel';
import { drainQuantities } from '../src/geometry/drainQuantities';
import { drainDrawing } from '../src/geometry/drainDrawing';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };
const close = (a: number, b: number, t = 1e-6) => Math.abs(a - b) <= t;
const attrs = { trade: '屋根工事', item: '屋根材' };
const SCALE = 50;

const roof = buildRoofModelFromFaces([
  { vertices: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }], pitch: 5, attrs, eaveEdgeIndex: 0 },
  { vertices: [{ x: 0, y: 300 }, { x: 400, y: 300 }, { x: 400, y: 600 }, { x: 0, y: 600 }], pitch: 5, attrs, eaveEdgeIndex: 2 },
], { scale: SCALE });
const eaveA = (roof.faces[0].slope.downhill as { toEdgeId: string }).toEdgeId;
const eaveB = (roof.faces[1].slope.downhill as { toEdgeId: string }).toEdgeId;
const EMPTY: DrainGraph = { nodes: [], edges: [] };
const dm = (runs: GutterRun[], graph: DrainGraph = EMPTY): DrainModel => ({ schemaVersion: 1, id: 'DR-1', roofId: roof.id, runs, graph });
const q = (runs: GutterRun[], graph: DrainGraph = EMPTY) => drainQuantities(roof, dm(runs, graph), SCALE);
const get = (arr: ReturnType<typeof q>, k: string) => arr.find((x) => x.key === k);

ok(emptyDrainModel().runs.length === 0 && emptyDrainModel().graph.nodes.length === 0 && emptyDrainModel().schemaVersion === 1, 'emptyDrainModel');
ok(!!dropPoint(roof, eaveA, 0.5), 'dropPoint（Roof参照）');

// segmentKind: 向きから 竪樋/呼び樋 を派生（部材名を保存しない＝Evidence First）
ok(segmentKind({ x: 0, y: 0 }, { x: 0, y: 150 }) === 'downspout', 'segmentKind: 縦=竪樋(downspout)');
ok(segmentKind({ x: 0, y: 0 }, { x: 150, y: 0 }) === 'connector', 'segmentKind: 横=呼び樋(connector)');

// 1) 左流れ + 竪樋 Graph（drop → drain の縦Edge 1本＝3m）
const runL: GutterRun = { id: 'gr1', eaveEdgeId: eaveA, flowDirection: 'left', drops: [{ id: 'd1', position: 0 }] };
const graphL: DrainGraph = {
  nodes: [
    { id: 'n1', kind: 'drop', point: { x: 0, y: 0 }, dropId: 'd1' },
    { id: 'n2', kind: 'drain', point: { x: 0, y: 150 } },
  ],
  edges: [{ id: 'e1', from: 'n1', to: 'n2' }],
};
const q1 = q([runL], graphL);
ok(close(get(q1, 'gutterLength')!.value, 8), '左流れ 軒樋長=8m');
ok(get(q1, 'outletCount')!.value === 1 && close(get(q1, 'downspoutLength')!.value, 3), '左流れ 集水器1・竪樋3m');
ok(get(q1, 'drainCount')!.value === 1, '左流れ 排水1（drain Node）');
ok(gutterFlow(runL).length === 1, '左流れ 射影=1区間');

// 2) 両流れ・中央集水（集水器1・射影2区間）
const runC: GutterRun = { id: 'gr3', eaveEdgeId: eaveA, flowDirection: 'both', drops: [{ id: 'dc', position: 0.5 }] };
ok(get(q([runC]), 'outletCount')!.value === 1 && gutterFlow(runC).length === 2, '両流れ中央 集水器1・射影2区間');

// 3) 両流れ・両端集水（集水器2）+ 竪樋2本（計6m）
const runB: GutterRun = { id: 'gr4', eaveEdgeId: eaveA, flowDirection: 'both', drops: [{ id: 'dL', position: 0 }, { id: 'dR', position: 1 }] };
const graphB: DrainGraph = {
  nodes: [
    { id: 'L1', kind: 'drop', point: { x: 0, y: 0 }, dropId: 'dL' }, { id: 'L2', kind: 'drain', point: { x: 0, y: 150 } },
    { id: 'R1', kind: 'drop', point: { x: 400, y: 0 }, dropId: 'dR' }, { id: 'R2', kind: 'drain', point: { x: 400, y: 150 } },
  ],
  edges: [{ id: 'eL', from: 'L1', to: 'L2' }, { id: 'eR', from: 'R1', to: 'R2' }],
};
const q4 = q([runB], graphB);
ok(get(q4, 'outletCount')!.value === 2 && close(get(q4, 'downspoutLength')!.value, 6), '両流れ両端 集水器2・竪樋6m');
ok(get(q([runC]), 'outletCount')!.value !== q4.find((x) => x.key === 'outletCount')!.value, 'both を drops で中央/両端 区別（1≠2）');

// 4) L字経路：竪樋 → エルボ → 呼び樋（縦Edge=竪樋 / 横Edge=呼び樋 / elbow Node）
const graphLShape: DrainGraph = {
  nodes: [
    { id: 'a', kind: 'drop', point: { x: 0, y: 0 }, dropId: 'd1' },
    { id: 'b', kind: 'elbow', point: { x: 0, y: 100 } },
    { id: 'c', kind: 'drain', point: { x: 150, y: 100 } },
  ],
  edges: [{ id: 'v', from: 'a', to: 'b' }, { id: 'h', from: 'b', to: 'c' }],
};
const qL = q([runL], graphLShape);
ok(close(qL.find((x) => x.key === 'downspoutLength')!.value, 2), 'L字 竪樋2m（縦Edge）');
ok(close(qL.find((x) => x.key === 'connectorLength')!.value, 3), 'L字 呼び樋3m（横Edge）');
ok(qL.find((x) => x.key === 'elbowCount')!.value === 1, 'L字 エルボ1（elbow Node）');
// Segment evidence: 竪樋長の証拠が edge を指す（Route も Evidence First）
const dsQ = qL.find((x) => x.key === 'downspoutLength')!;
ok(dsQ.evidence.some((e) => e.kind === 'segment' && e.id === 'v'), '竪樋長 evidence が Segment(edge) を指す');

// 両軒に軒樋 → 16m・gutter_run 証拠2本
const gl = get(q([
  { id: 'grA', eaveEdgeId: eaveA, flowDirection: 'left', drops: [{ id: 'a', position: 0 }] },
  { id: 'grB', eaveEdgeId: eaveB, flowDirection: 'left', drops: [{ id: 'b', position: 0 }] },
]), 'gutterLength')!;
ok(close(gl.value, 16) && gl.evidence.length === 2 && gl.evidence.every((e) => e.kind === 'gutter_run'), '両軒 軒樋長16m・gutter_run証拠2本');

// ── Drain Drawing（射影・Roof参照）──
const dwg1 = drainDrawing(roof, dm([runL], graphL));
ok(dwg1.gutters.length === 1 && dwg1.drops.length === 1 && dwg1.flows.length === 1 && dwg1.segments.length === 1 && dwg1.nodes.length === 2, '左流れ 作図: 軒樋1/集水器1/流れ1/Segment1/Node2');
const dwg4 = drainDrawing(roof, dm([runB], graphB));
ok(dwg4.gutters.length === 1 && dwg4.drops.length === 2 && dwg4.flows.length === 2 && dwg4.segments.length === 2, '両端集水 作図: 集水器2/流れ2/Segment2');
ok(dwg1.segments[0].kind === 'downspout', '作図 Segment.kind=downspout（縦）');
// 軒樋線は軒Edgeの端点に一致（Roofを参照している証拠）
const eaveEdge = roof.edges.find((e) => e.id === eaveA)!;
const Vm = new Map(roof.vertices.map((v) => [v.id, v]));
const va = Vm.get(eaveEdge.v[0])!;
ok(dwg1.gutters[0].a.x === va.x && dwg1.gutters[0].a.y === va.y, '軒樋線=軒Edge端点（Roof参照）');

if (fails.length) {
  console.error(`❌ Drain Model test: ${fails.length} 失敗 / ${pass + fails.length} 中`);
  for (const f of fails) console.error('   - ' + f);
  process.exit(1);
}
console.log(`✅ Drain Model test: 全 ${pass} 件合格（兄弟モデル・Graph射影・Evidence数量・Drain Drawing）`);
