// 甍AI Drain Validator 自己テスト（v0.2 Graph）— Reducer と Validator の責務分離（憲法6）。
//   Reducer は position=1.8 でも適用（止めない）→ Validator が 'DropOutsideEdge' を返す。
//   排水経路 Graph は Graph 探索で検査：DanglingSegment（error）/ DisconnectedNode（warning）。
import { buildRoofModelFromFaces } from '../src/geometry/roofModel';
import { emptyDrainModel } from '../src/geometry/drainModel';
import type { DrainModel, GutterRun, DrainGraph } from '../src/geometry/drainModel';
import { drainReducer } from '../src/geometry/drainCommands';
import { initHistory, dispatch } from '../src/geometry/history';
import { validateDrainModel } from '../src/geometry/drainValidator';
import { hasErrors } from '../src/geometry/validation';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };
const attrs = { trade: '屋根工事', item: '屋根材' };
const EMPTY: DrainGraph = { nodes: [], edges: [] };

const roof = buildRoofModelFromFaces([
  { vertices: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }], pitch: 5, attrs, eaveEdgeIndex: 0 },
  { vertices: [{ x: 0, y: 300 }, { x: 400, y: 300 }, { x: 400, y: 600 }, { x: 0, y: 600 }], pitch: 5, attrs, eaveEdgeIndex: 2 },
], { scale: 50 });
const eaveA = (roof.faces[0].slope.downhill as { toEdgeId: string }).toEdgeId;
const codes = (dm: DrainModel) => validateDrainModel(roof, dm).map((i) => i.code);

// 妥当なモデル → error なし（drop→drain の縦Edge・全Node接続）
const good: DrainModel = { schemaVersion: 1, id: 'DR', roofId: roof.id,
  runs: [{ id: 'gr1', eaveEdgeId: eaveA, flowDirection: 'both', drops: [{ id: 'd1', position: 0.5 }] }],
  graph: {
    nodes: [{ id: 'n1', kind: 'drop', point: { x: 0, y: 0 }, dropId: 'd1' }, { id: 'n2', kind: 'drain', point: { x: 0, y: 150 } }],
    edges: [{ id: 'e1', from: 'n1', to: 'n2' }],
  } };
ok(!hasErrors(validateDrainModel(roof, good)), '妥当なモデル → error なし');

// ★ Reducer は position=1.8 を止めない → Validator が DropOutsideEdge
const run: GutterRun = { id: 'gr1', eaveEdgeId: eaveA, flowDirection: 'left', drops: [{ id: 'd1', position: 0 }] };
let h = initHistory(emptyDrainModel(undefined, roof.id));
h = dispatch(h, drainReducer, { type: 'AddRun', run });
h = dispatch(h, drainReducer, { type: 'MoveDrop', dropId: 'd1', position: 1.8 }); // ← Reducer は適用する
ok(h.present.runs[0].drops[0].position === 1.8, 'Reducer は 1.8 を適用（止めない）');
ok(codes(h.present).includes('DropOutsideEdge') && hasErrors(validateDrainModel(roof, h.present)), 'Validator が DropOutsideEdge を検出（error）');
const dropIssue = validateDrainModel(roof, h.present).find((i) => i.code === 'DropOutsideEdge')!;
ok(dropIssue.evidence.some((e) => e.id === 'd1') && dropIssue.evidence.some((e) => e.kind === 'gutter_run'), 'DropOutsideEdge の evidence に 集水器 d1 と軒樋（Quantityと同型でハイライト可）');

// EaveNotFound
const badEave: DrainModel = { schemaVersion: 1, id: 'DR', runs: [{ id: 'r', eaveEdgeId: 'E-999', flowDirection: 'left', drops: [{ id: 'x', position: 0 }] }], graph: EMPTY };
ok(codes(badEave).includes('EaveNotFound'), '存在しない軒Edge → EaveNotFound');

// DanglingSegment：存在しない Node を参照する Edge（error）
const dangling: DrainModel = { schemaVersion: 1, id: 'DR', roofId: roof.id, runs: [],
  graph: { nodes: [{ id: 'n1', kind: 'drop', point: { x: 0, y: 0 } }], edges: [{ id: 'e1', from: 'n1', to: 'ghost' }] } };
ok(codes(dangling).includes('DanglingSegment') && hasErrors(validateDrainModel(roof, dangling)), '存在しないNode参照 → DanglingSegment（error）');
const danglingIssue = validateDrainModel(roof, dangling).find((i) => i.code === 'DanglingSegment')!;
ok(danglingIssue.evidence.some((e) => e.kind === 'segment' && e.id === 'e1'), 'DanglingSegment の evidence が Segment(edge) を指す');

// DisconnectedNode：Edge を1本も持たない Node（warning）
const lonely: DrainModel = { schemaVersion: 1, id: 'DR', roofId: roof.id, runs: [],
  graph: { nodes: [{ id: 'solo', kind: 'drain', point: { x: 0, y: 0 } }], edges: [] } };
ok(codes(lonely).includes('DisconnectedNode') && !hasErrors(validateDrainModel(roof, lonely)), '孤立Node → DisconnectedNode（warning・errorなし）');
const lonelyIssue = validateDrainModel(roof, lonely).find((i) => i.code === 'DisconnectedNode')!;
ok(lonelyIssue.evidence.some((e) => e.kind === 'node' && e.id === 'solo'), 'DisconnectedNode の evidence が Node を指す');

// RunHasNoDrop（warning・error ではない）
const noDrop: DrainModel = { schemaVersion: 1, id: 'DR', runs: [{ id: 'r', eaveEdgeId: eaveA, flowDirection: 'left', drops: [] }], graph: EMPTY };
ok(codes(noDrop).includes('RunHasNoDrop') && !hasErrors(validateDrainModel(roof, noDrop)), '集水器なし → RunHasNoDrop（warning・errorなし）');

if (fails.length) {
  console.error(`❌ Drain Validator test: ${fails.length} 失敗 / ${pass + fails.length} 中`);
  for (const f of fails) console.error('   - ' + f);
  process.exit(1);
}
console.log(`✅ Drain Validator test: 全 ${pass} 件合格（Reducer↔Validator 責務分離・Graph妥当性判定）`);
