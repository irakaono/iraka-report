// 甍AI Drain Validator — Drain Model の妥当性判定（Reducer とは分離・憲法6）。
//   ★ Engine Boundary: Roof は "Model" だけ参照（roofEngine は呼ばない）。
//   ★ 排水経路 Graph の検査（DanglingSegment / DisconnectedNode …）は Graph 探索で書ける。
//   ★ Issue は evidence[] を持つ＝Quantity と同じ機構でハイライト（Studio に専用選択ロジックを増やさない）。
import type { RoofModel } from './roofModel';
import type { DrainModel } from './drainModel';
import type { ValidationIssue } from './validation';

export function validateDrainModel(roof: RoofModel, drain: DrainModel): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const edgeById = new Set(roof.edges.map((e) => e.id));
  const nodeIds = new Set(drain.graph.nodes.map((n) => n.id));

  // 軒樋 / 集水器（Roof Model 参照）
  for (const r of drain.runs) {
    if (!edgeById.has(r.eaveEdgeId)) issues.push({ code: 'EaveNotFound', severity: 'error', message: `軒Edge ${r.eaveEdgeId} が Roof に存在しません`, evidence: [{ kind: 'gutter_run', id: r.eaveEdgeId }] });
    if (r.drops.length === 0) issues.push({ code: 'RunHasNoDrop', severity: 'warning', message: `軒樋 ${r.id} に集水器がありません`, evidence: [{ kind: 'gutter_run', id: r.eaveEdgeId }] });
    for (const d of r.drops) if (d.position < 0 || d.position > 1) issues.push({ code: 'DropOutsideEdge', severity: 'error', message: `集水器 ${d.id} が軒の外（position=${d.position}）`, evidence: [{ kind: 'drop', id: d.id }, { kind: 'gutter_run', id: r.eaveEdgeId }] });
  }

  // 排水経路 Graph
  const incident = new Map<string, number>();
  for (const e of drain.graph.edges) {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) issues.push({ code: 'DanglingSegment', severity: 'error', message: `経路区間 ${e.id} が存在しない Node を参照`, evidence: [{ kind: 'segment', id: e.id }] });
    incident.set(e.from, (incident.get(e.from) ?? 0) + 1);
    incident.set(e.to, (incident.get(e.to) ?? 0) + 1);
  }
  for (const n of drain.graph.nodes) if ((incident.get(n.id) ?? 0) === 0) issues.push({ code: 'DisconnectedNode', severity: 'warning', message: `Node ${n.id}（${n.kind}）が経路に繋がっていません`, evidence: [{ kind: 'node', id: n.id }] });

  return issues;
}
