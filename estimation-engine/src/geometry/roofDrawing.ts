// 甍AI Roof Drawing Engine — 屋根伏図の「再構築」（STEP3）。
//   Roof Model → 作図プリミティブ への【決定的な射影】。生成AIではない・可逆・検証可能。
//   これが通れば Roof Model が本当に Canonical（同じモデルから 数量も伏図も出る）だと証明できる。
//   ※ 将来 Wall/Foundation も同じ形の drawing() を持てる（Engine Studio 化への布石）。
import type { RoofModel, EdgeRole, Point } from './roofModel';
import { facePolygon } from './roofModel';
import { edgeRole, faceDownhill } from './roofEngine';

export interface DrawnEdge { edgeId: string; role?: EdgeRole; a: Point; b: Point }
export interface DrawnFace { faceId: string; centroid: Point; downhill: Point | null; pitch?: number }
export interface RoofDrawing {
  edges: DrawnEdge[];
  faces: DrawnFace[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

function centroid(pts: Point[]): Point {
  if (!pts.length) return { x: 0, y: 0 };
  let x = 0, y = 0;
  for (const p of pts) { x += p.x; y += p.y; }
  return { x: x / pts.length, y: y / pts.length };
}

/** Roof Model → 伏図プリミティブ（辺＝役割つき線、面＝重心＋流れ方向、外接矩形）。純関数。 */
export function roofDrawing(model: RoofModel): RoofDrawing {
  const V = new Map(model.vertices.map((v) => [v.id, v]));
  const edges: DrawnEdge[] = model.edges.map((e) => {
    const a = V.get(e.v[0]); const b = V.get(e.v[1]);
    return { edgeId: e.id, role: edgeRole(model, e), a: a ? { x: a.x, y: a.y } : { x: 0, y: 0 }, b: b ? { x: b.x, y: b.y } : { x: 0, y: 0 } };
  });
  const faces: DrawnFace[] = model.faces.map((f) => ({
    faceId: f.id,
    centroid: centroid(facePolygon(model, f)),
    downhill: faceDownhill(model, f),   // 流れ方向（平面・下り）。伏図の矢印＝DrainPath の起点
    pitch: f.slope.pitch,
  }));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const v of model.vertices) { minX = Math.min(minX, v.x); minY = Math.min(minY, v.y); maxX = Math.max(maxX, v.x); maxY = Math.max(maxY, v.y); }
  if (!model.vertices.length) { minX = minY = 0; maxX = maxY = 100; }
  return { edges, faces, bounds: { minX, minY, maxX, maxY } };
}
