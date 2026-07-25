// 甍AI 自動提案（AI積算 v0）— 屋根 Geometry から雨樋を決定的に提案する。
//   ★これは「Recognizer(図面→Geometry 自動認識)」ではなく「Geometry→雨樋の自動拾い」＝Provider の一つ。
//   ★手拾い(Human Provider)と同じ測定系(Acceptance/Baseline)で並べて評価できる。図面認識は段階的に載せる。
//   規則(v0)：全軒に軒樋／各軒の両端付近に集水器／各集水器から縦樋を下ろす。数量は既存 drainQuantities がそのまま出す。
import type { RoofModel } from './roofModel';
import { edgeRole } from './roofEngine';
import type { DrainModel, DrainNode, DrainEdge, GutterRun } from './drainModel';
import { emptyDrainModel, dropPoint } from './drainModel';

const DOWNSPOUT_PX = 150;      // 縦樋の既定長(px)。実寸は scale で決まる（提案の初期値・立面から精緻化は後段）。
const DROP_POSITIONS = [0.15, 0.85]; // 各軒の集水器位置（両端付近）。提案なので手拾いで補正する前提。

export interface ProposeResult { model: DrainModel; note: string; eaveCount: number; dropCount: number }

// 屋根 Geometry → 雨樋 DrainModel（純関数・副作用なし）。手拾いを壊さず別モデルとして比較に使う。
export function autoProposeGutter(roof: RoofModel): ProposeResult {
  const base = emptyDrainModel('DR-AI', roof.id);
  const runs: GutterRun[] = [];
  const nodes: DrainNode[] = [];
  const edges: DrainEdge[] = [];
  let ri = 0, di = 0, ni = 0, ei = 0;
  const eaves = roof.edges.filter((e) => edgeRole(roof, e) === 'eave');
  for (const e of eaves) {
    const drops = DROP_POSITIONS.map((position) => ({ id: `ai-d${di++}`, position }));
    runs.push({ id: `ai-r${ri++}`, eaveEdgeId: e.id, flowDirection: 'both', drops });
    for (const d of drops) {
      const p = dropPoint(roof, e.id, d.position);
      if (!p) continue;
      const dropNode: DrainNode = { id: `ai-n${ni++}`, kind: 'drop', point: p, dropId: d.id };
      const drainNode: DrainNode = { id: `ai-n${ni++}`, kind: 'drain', point: { x: p.x, y: p.y + DOWNSPOUT_PX } };
      nodes.push(dropNode, drainNode);
      edges.push({ id: `ai-e${ei++}`, from: dropNode.id, to: drainNode.id });
    }
  }
  return {
    model: { ...base, runs, graph: { nodes, edges } },
    note: `全軒${eaves.length}本に軒樋・各軒両端に集水器・縦樋(既定${DOWNSPOUT_PX}px)`,
    eaveCount: eaves.length,
    dropCount: runs.reduce((a, r) => a + r.drops.length, 0),
  };
}
