// 甍AI Drain Drawing — 雨樋図の決定的射影（Roof Drawing の兄弟）。runs＋graph を作図プリミティブへ。
import type { RoofModel, Point } from './roofModel';
import type { DrainModel, FlowDirection } from './drainModel';
import { gutterFlow, dropPoint, edgeEnds, segmentKind } from './drainModel';

export interface DrawnGutter { runId: string; eaveEdgeId: string; a: Point; b: Point; flowDirection: FlowDirection }
export interface DrawnDrop { dropId: string; runId: string; point: Point }
export interface DrawnFlow { dropId: string; from: Point; to: Point }
export interface DrawnSegment { edgeId: string; kind: 'downspout' | 'connector'; a: Point; b: Point }
export interface DrawnNode { nodeId: string; kind: string; point: Point }
export interface DrainDrawing {
  gutters: DrawnGutter[]; drops: DrawnDrop[]; flows: DrawnFlow[]; segments: DrawnSegment[]; nodes: DrawnNode[];
}

function eaveEnds(roof: RoofModel, eaveEdgeId: string): { a: Point; b: Point } | null {
  const e = roof.edges.find((x) => x.id === eaveEdgeId); if (!e) return null;
  const V = new Map(roof.vertices.map((v) => [v.id, v]));
  const a = V.get(e.v[0]); const b = V.get(e.v[1]);
  return a && b ? { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } } : null;
}

export function drainDrawing(roof: RoofModel, drain: DrainModel): DrainDrawing {
  const gutters: DrawnGutter[] = [];
  const drops: DrawnDrop[] = [];
  const flows: DrawnFlow[] = [];
  for (const r of drain.runs) {
    const ends = eaveEnds(roof, r.eaveEdgeId);
    if (ends) gutters.push({ runId: r.id, eaveEdgeId: r.eaveEdgeId, a: ends.a, b: ends.b, flowDirection: r.flowDirection });
    const dropPt = new Map<string, Point>();
    for (const d of r.drops) { const pt = dropPoint(roof, r.eaveEdgeId, d.position); if (pt) { drops.push({ dropId: d.id, runId: r.id, point: pt }); dropPt.set(d.id, pt); } }
    for (const seg of gutterFlow(r)) {
      const from = dropPoint(roof, r.eaveEdgeId, (seg.fromPos + seg.toPos) / 2);
      const to = dropPt.get(seg.dropId);
      if (from && to) flows.push({ dropId: seg.dropId, from, to });
    }
  }
  const segments: DrawnSegment[] = [];
  for (const e of drain.graph.edges) {
    const ends = edgeEnds(drain.graph, e); if (!ends) continue;
    segments.push({ edgeId: e.id, kind: segmentKind(ends.a, ends.b), a: ends.a, b: ends.b });
  }
  const nodes: DrawnNode[] = drain.graph.nodes.map((n) => ({ nodeId: n.id, kind: n.kind, point: n.point }));
  return { gutters, drops, flows, segments, nodes };
}
