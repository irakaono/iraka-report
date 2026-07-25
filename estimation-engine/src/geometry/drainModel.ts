// 甍AI Drain Model — 雨樋の【兄弟モデル】。排水経路は Node/Edge Graph が唯一の真実。
//   ★ Runtime は Polyline を保存しない。Node/Edge Graph を唯一の真実とし、Studio はそれを Polyline として編集・表示する。
//     → 一本道も分岐/合流も同じ Graph。Material Adapter/Validator は Graph を読むだけ（Compilerらしい設計）。
//   ★ 兄弟モデル：Roof を roofId/eaveEdgeId で参照するだけ（屋根変更→雨樋だけ再投影）。
//   ★ 推論と Evidence の分離：flowDirection=both は何も決めない。drops[] が中央/両端集水を決める。
import type { RoofModel, Point } from './roofModel';
import { edgeLength } from './roofModel';

export type FlowDirection = 'left' | 'right' | 'both';

export interface GutterDrop { id: string; position: number; }        // 集水器：軒Edge上 0.0〜1.0
export interface GutterRun { id: string; eaveEdgeId: string; flowDirection: FlowDirection; drops: GutterDrop[]; }

// 排水経路 Graph
export type DrainNodeKind = 'drop' | 'elbow' | 'drain' | 'junction';
export interface DrainNode { id: string; kind: DrainNodeKind; point: Point; dropId?: string; } // kind='drop' は集水器に対応
export interface DrainEdge { id: string; from: string; to: string; }  // Node id を結ぶ（＝竪樋/呼び樋の1区間=Segment）
export interface DrainGraph { nodes: DrainNode[]; edges: DrainEdge[]; }

export interface DrainModel {
  schemaVersion: 1;
  id: string;
  roofId?: string;                 // 参照する Roof Model（兄弟）
  runs: GutterRun[];               // 軒樋
  graph: DrainGraph;               // 排水経路（唯一の真実）
}

export function emptyDrainModel(id = 'DR-1', roofId?: string): DrainModel {
  return { schemaVersion: 1, id, roofId, runs: [], graph: { nodes: [], edges: [] } };
}

// ───────── 決定的射影（flowDirection ＋ drops → 軒樋の流れ区間）─────────
export interface FlowSegment { fromPos: number; toPos: number; dropId: string; }
export function gutterFlow(run: GutterRun): FlowSegment[] {
  const drops = [...run.drops].sort((a, b) => a.position - b.position);
  if (drops.length === 0) return [];
  if (run.flowDirection === 'left') return [{ fromPos: 0, toPos: 1, dropId: drops[0].id }];
  if (run.flowDirection === 'right') return [{ fromPos: 0, toPos: 1, dropId: drops[drops.length - 1].id }];
  if (drops.length === 1) return [
    { fromPos: 0, toPos: drops[0].position, dropId: drops[0].id },
    { fromPos: drops[0].position, toPos: 1, dropId: drops[0].id },
  ];
  const segs: FlowSegment[] = [];
  for (let i = 0; i < drops.length - 1; i++) {
    const mid = (drops[i].position + drops[i + 1].position) / 2;
    segs.push({ fromPos: drops[i].position, toPos: mid, dropId: drops[i].id });
    segs.push({ fromPos: mid, toPos: drops[i + 1].position, dropId: drops[i + 1].id });
  }
  return segs;
}

export function dropPoint(roof: RoofModel, eaveEdgeId: string, position: number): Point | null {
  const e = roof.edges.find((x) => x.id === eaveEdgeId);
  if (!e) return null;
  const V = new Map(roof.vertices.map((v) => [v.id, v]));
  const a = V.get(e.v[0]); const b = V.get(e.v[1]);
  if (!a || !b) return null;
  return { x: a.x + (b.x - a.x) * position, y: a.y + (b.y - a.y) * position };
}
export function eaveLengthM(roof: RoofModel, eaveEdgeId: string, scale: number): number {
  const e = roof.edges.find((x) => x.id === eaveEdgeId);
  return e ? edgeLength(roof, e) / scale : 0;
}

// ───────── Graph ヘルパー（Segment=Edge の幾何。部材名は持たず、位置から派生） ─────────
export function nodeMap(g: DrainGraph): Map<string, DrainNode> { return new Map(g.nodes.map((n) => [n.id, n])); }
export function edgeEnds(g: DrainGraph, e: DrainEdge): { a: Point; b: Point } | null {
  const m = nodeMap(g); const a = m.get(e.from); const b = m.get(e.to);
  return a && b ? { a: a.point, b: b.point } : null;
}
// 竪樋(vertical) か 呼び樋(horizontal) かは向きから決める（部材名を保存しない＝Evidence First）
export function segmentKind(a: Point, b: Point): 'downspout' | 'connector' {
  return Math.abs(b.y - a.y) >= Math.abs(b.x - a.x) ? 'downspout' : 'connector';
}
export function segmentLengthM(g: DrainGraph, e: DrainEdge, scale: number): number {
  const ends = edgeEnds(g, e); if (!ends) return 0;
  return Math.hypot(ends.b.x - ends.a.x, ends.b.y - ends.a.y) / scale;
}
