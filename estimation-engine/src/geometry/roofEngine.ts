// 甍AI Roof Geometry Engine — 役割の創発（EdgeRole）。ROOF_MODEL_SPEC §6。
//   「面は自分の軒を指す（slope.downhill.toEdgeId）」を起点に、辺の役割を式で導く。
//   人が棟/谷/隅棟を描く必要はない。Face を置けば役割が決まる（これが核）。
import type { RoofModel, Face, Edge, EdgeRole, RoofType, Point } from './roofModel';
import { facePolygon } from './roofModel';

const norm = (p: Point): Point => { const d = Math.hypot(p.x, p.y) || 1; return { x: p.x / d, y: p.y / d }; };
const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;

function faceCentroid(model: RoofModel, face: Face): Point {
  const pts = facePolygon(model, face);
  if (!pts.length) return { x: 0, y: 0 };
  let x = 0, y = 0;
  for (const p of pts) { x += p.x; y += p.y; }
  return { x: x / pts.length, y: y / pts.length };
}

/** 面の「流れ方向（平面・下り）」単位ベクトル。軒(downhill.toEdgeId)から導出。無ければ null。 */
export function faceDownhill(model: RoofModel, face: Face): Point | null {
  const dh = face.slope.downhill;
  if (!dh || !('toEdgeId' in dh)) return null; // azimuth 変種は v1 エンジンでは未対応
  const e = model.edges.find((x) => x.id === dh.toEdgeId);
  if (!e) return null;
  const V = new Map(model.vertices.map((v) => [v.id, v]));
  const a = V.get(e.v[0]); const b = V.get(e.v[1]);
  if (!a || !b) return null;
  const eDir = norm({ x: b.x - a.x, y: b.y - a.y });
  let n = { x: -eDir.y, y: eDir.x };                    // 軒辺に垂直
  const Me = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const C = faceCentroid(model, face);
  if (dot(n, { x: Me.x - C.x, y: Me.y - C.y }) < 0) n = { x: -n.x, y: -n.y }; // 重心→軒 が下り
  return norm(n);
}

/**
 * 辺の役割を創発する（roleOverride があればそれを優先＝人の判断・憲法12）。
 *  境界辺（面1枚）: 下り方向に平行→ケラバ gable / 垂直（水平輪郭）→軒 eave
 *  共有辺（面2枚）: 両面が離れて下る(凸)→ 逆向き=棟 ridge / 直交=隅棟 hip、 向かって下る(凹)→谷 valley
 */
export function edgeRole(model: RoofModel, edge: Edge): EdgeRole | undefined {
  if (edge.roleOverride) return edge.roleOverride;
  const V = new Map(model.vertices.map((v) => [v.id, v]));
  const a = V.get(edge.v[0]); const b = V.get(edge.v[1]);
  if (!a || !b) return undefined;
  const eDir = norm({ x: b.x - a.x, y: b.y - a.y });
  const Me = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const faces = model.faces.filter((f) => f.boundary.includes(edge.id));

  if (faces.length === 1) {
    const dh = faceDownhill(model, faces[0]);
    if (!dh) return undefined;
    return Math.abs(dot(eDir, dh)) > 0.5 ? 'gable' : 'eave';
  }
  if (faces.length >= 2) {
    const [f, g] = faces;
    const dhf = faceDownhill(model, f); const dhg = faceDownhill(model, g);
    if (!dhf || !dhg) return undefined;
    const Cf = faceCentroid(model, f); const Cg = faceCentroid(model, g);
    const awayF = dot(dhf, { x: Me.x - Cf.x, y: Me.y - Cf.y }) < 0; // 辺が f の上手（両面が離れて下る）
    const awayG = dot(dhg, { x: Me.x - Cg.x, y: Me.y - Cg.y }) < 0;
    if (awayF && awayG) return dot(dhf, dhg) < -0.5 ? 'ridge' : 'hip'; // 逆向き=棟 / 直交=隅棟
    return 'valley'; // 向かって下る（凹）＝谷
  }
  return undefined;
}

/** 全辺の役割マップ。 */
export function edgeRoles(model: RoofModel): Map<string, EdgeRole | undefined> {
  return new Map(model.edges.map((e) => [e.id, edgeRole(model, e)]));
}

/** 役割ごとの本数を数える（テスト・表示用）。 */
export function roleCounts(model: RoofModel): Record<string, number> {
  const c: Record<string, number> = {};
  for (const e of model.edges) { const r = edgeRole(model, e); if (r) c[r] = (c[r] ?? 0) + 1; }
  return c;
}

/**
 * 屋根タイプの創発（§5・分類関数・保存しない）。v1 は基本形のみ。
 * 招き/差し掛け（段違い・主従）は後の刻みで精緻化する。
 */
export function roofType(model: RoofModel): RoofType | undefined {
  const n = model.faces.length;
  if (n === 0) return undefined;
  if (n === 1) return 'shed';                     // 片流れ
  const c = roleCounts(model);
  const hips = c.hip ?? 0;
  const ridges = c.ridge ?? 0;
  if (n === 2 && ridges === 1 && hips === 0) return 'gable'; // 切妻
  if (hips >= 3) return 'hip';                    // 寄棟/方形
  if (ridges >= 1 && hips >= 1) return 'hip';     // 寄棟（棟＋隅棟）
  if (ridges >= 1) return 'gable';
  if (hips >= 1) return 'hip';
  return undefined;
}
