// 甍AI 自動提案（AI積算 v0）— 屋根 Geometry から雨樋を決定的に提案する。
//   ★これは「Recognizer(図面→Geometry 自動認識)」ではなく「Geometry→雨樋の自動拾い」＝Provider の一つ。
//   ★手拾い(Human Provider)と同じ測定系(Acceptance/Baseline)で並べて評価できる。図面認識は段階的に載せる。
//   規則(v0)：全軒に軒樋／各軒の両端付近に集水器。★縦樋は提案しない（平面には描かない）。
//     縦樋＝「どこへ降りるか」＝排水経路であって屋根形状ではない → 立面情報。数量も屋根と同時には確定させない
//     （＝「決められないものは決めない」）。縦樋長は後段の Drain Runtime（立面：軒高・排水先・エルボ）で確定する。
//     設計判断：2026-07-28（Phase B-1）。平面の集水器は残す（数＝確定）。
import type { RoofModel } from './roofModel';
import { edgeRole } from './roofEngine';
import type { DrainModel, GutterRun } from './drainModel';
import { emptyDrainModel } from './drainModel';

const DROP_POSITIONS = [0.15, 0.85]; // 各軒の集水器位置（両端付近）。提案なので手拾いで補正する前提。

export interface ProposeResult { model: DrainModel; note: string; eaveCount: number; dropCount: number }

// 屋根 Geometry → 雨樋 DrainModel（純関数・副作用なし）。手拾いを壊さず別モデルとして比較に使う。
//   ★graph は空（縦樋なし）。集水器は runs.drops として持つ（Drawing/Quantity はここから 集水器数 を出す）。
export function autoProposeGutter(roof: RoofModel): ProposeResult {
  const base = emptyDrainModel('DR-AI', roof.id);
  const runs: GutterRun[] = [];
  let ri = 0, di = 0;
  const eaves = roof.edges.filter((e) => edgeRole(roof, e) === 'eave');
  for (const e of eaves) {
    const drops = DROP_POSITIONS.map((position) => ({ id: `ai-d${di++}`, position }));
    runs.push({ id: `ai-r${ri++}`, eaveEdgeId: e.id, flowDirection: 'both', drops });
  }
  return {
    model: { ...base, runs, graph: { nodes: [], edges: [] } },
    note: `全軒${eaves.length}本に軒樋・各軒両端に集水器（縦樋は立面で確定＝平面には描かない）`,
    eaveCount: eaves.length,
    dropCount: runs.reduce((a, r) => a + r.drops.length, 0),
  };
}
