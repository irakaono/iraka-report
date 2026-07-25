// 甍AI Drain Commands / Reducer / Undo-Redo 自己テスト（v0.2 Graph）。
//   「UI は Model を書き換えず Command を発行するだけ」を固定。reducer は純関数、Undo/Redo は無料。
//   排水経路は Node/Edge Graph を編集する（AddNode/AddEdge/DeleteNode…）。DeleteNode は付随 Edge も除去。
import { emptyDrainModel } from '../src/geometry/drainModel';
import type { GutterRun, DrainNode, DrainEdge } from '../src/geometry/drainModel';
import { drainReducer } from '../src/geometry/drainCommands';
import type { DrainCommand } from '../src/geometry/drainCommands';
import { initHistory, dispatch, undo, redo, canUndo, canRedo } from '../src/geometry/history';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };

const run1: GutterRun = { id: 'gr1', eaveEdgeId: 'E-1', flowDirection: 'both', drops: [] };
const nDrop: DrainNode = { id: 'n1', kind: 'drop', point: { x: 0, y: 0 }, dropId: 'd1' };
const nDrain: DrainNode = { id: 'n2', kind: 'drain', point: { x: 0, y: 150 } };
const edge1: DrainEdge = { id: 'e1', from: 'n1', to: 'n2' };
const dz = <C extends DrainCommand>(h: ReturnType<typeof initHistory<ReturnType<typeof emptyDrainModel>>>, c: C) => dispatch(h, drainReducer, c);

// 純関数: reducer は入力 Model を変更しない
const base = emptyDrainModel();
const after = drainReducer(base, { type: 'AddRun', run: run1 });
ok(base.runs.length === 0 && after.runs.length === 1 && after !== base, 'reducer は純関数（入力不変・新Model返す）');

// ── 軒樋 Command 列 ──
let h = initHistory(emptyDrainModel());
h = dz(h, { type: 'AddRun', run: run1 });
ok(h.present.runs.length === 1, 'AddRun');
h = dz(h, { type: 'AddDrop', runId: 'gr1', drop: { id: 'd1', position: 0 } });
h = dz(h, { type: 'AddDrop', runId: 'gr1', drop: { id: 'd2', position: 1 } });
ok(h.present.runs[0].drops.length === 2, 'AddDrop×2');
h = dz(h, { type: 'MoveDrop', dropId: 'd2', position: 0.5 });
ok(h.present.runs[0].drops.find((d) => d.id === 'd2')!.position === 0.5, 'MoveDrop');
h = dz(h, { type: 'DeleteDrop', dropId: 'd2' });
ok(h.present.runs[0].drops.length === 1, 'DeleteDrop');

// ── 排水経路 Graph Command 列 ──
h = dz(h, { type: 'AddNode', node: nDrop });
h = dz(h, { type: 'AddNode', node: nDrain });
ok(h.present.graph.nodes.length === 2, 'AddNode×2');
h = dz(h, { type: 'AddEdge', edge: edge1 });
ok(h.present.graph.edges.length === 1, 'AddEdge');

// Undo/Redo（無料）
ok(canUndo(h) && !canRedo(h), 'canUndo=true / canRedo=false');
h = undo(h);                                                       // AddEdge を取り消し
ok(h.present.graph.edges.length === 0 && canRedo(h), 'Undo: Edge が戻る・Redo可能');
h = redo(h);                                                       // やり直し
ok(h.present.graph.edges.length === 1, 'Redo: Edge が復活');

// DeleteNode は付随する Edge も除去（DanglingSegment を作らない）
const hDel = dz(h, { type: 'DeleteNode', nodeId: 'n2' });
ok(hDel.present.graph.nodes.length === 1 && hDel.present.graph.edges.length === 0, 'DeleteNode: 付随Edgeも除去（Danglingを作らない）');

// DeleteEdge（Node は残る）
const hDelEdge = dz(h, { type: 'DeleteEdge', edgeId: 'e1' });
ok(hDelEdge.present.graph.edges.length === 0 && hDelEdge.present.graph.nodes.length === 2, 'DeleteEdge（Nodeは残る）');

// Undo を底まで → 空へ
for (let i = 0; i < 30; i++) h = undo(h);
ok(h.present.runs.length === 0 && h.present.graph.nodes.length === 0 && !canUndo(h), 'Undo を底まで → 空Model・canUndo=false');

// DeleteRun
let h2 = initHistory(emptyDrainModel());
h2 = dz(h2, { type: 'AddRun', run: run1 });
h2 = dz(h2, { type: 'DeleteRun', runId: 'gr1' });
ok(h2.present.runs.length === 0, 'DeleteRun');

// 同一 Command で変化が無ければ履歴を積まない（参照等価）
const h3 = dz(h2, { type: 'DeleteRun', runId: 'no-such' });
ok(h3 === h2, '変化なしの Command は履歴に積まない');
const h4 = dz(h2, { type: 'DeleteNode', nodeId: 'no-such' });
ok(h4 === h2, '存在しない Node の DeleteNode も履歴に積まない');
const h5 = dz(h2, { type: 'DeleteEdge', edgeId: 'no-such' });
ok(h5 === h2, '存在しない Edge の DeleteEdge も履歴に積まない');

if (fails.length) {
  console.error(`❌ Drain Commands test: ${fails.length} 失敗 / ${pass + fails.length} 中`);
  for (const f of fails) console.error('   - ' + f);
  process.exit(1);
}
console.log(`✅ Drain Commands test: 全 ${pass} 件合格（Command/Reducer 純関数・Graph編集・Undo/Redo 無料）`);
