// 甍AI Roof Model — ROOF_MODEL_SPEC v1.0 の型 ＋ 検証可能な素関数。
//   ここは「型 ＋ shoelace(面積) ＋ 辺の共有/境界判定 ＋ Face合成ビルダー」まで。
//   役割の創発(edgeRole) / タイプ(roofType) / 数量(roofQuantities) は次の刻みで追加する。
//   保存するのは RoofModel（幾何＋属性）だけ。面積・長さ等はすべて派生（式）。

// 基本役割（幾何から創発）＋ 水上の納まり（人が指定＝roleOverride。片流れの水上等）。
//   wall_flashing=雨押え / shed_ridge=片棟 / grip=つかみ込み（軒と同仕様だが軒樋は付かない）。
export type EdgeRole = 'ridge' | 'hip' | 'valley' | 'eave' | 'gable' | 'wall_flashing' | 'shed_ridge' | 'grip';
export type RoofType = 'shed' | 'gable' | 'hip' | 'saltbox' | 'lean_to';
export type AnnotationKind =
  | 'gutter_eave' | 'gutter_down' | 'gutter_valley'
  | 'snowstop' | 'ridgevent' | 'skylight' | 'solar' | 'inspection';

// すべての構成要素の共通親（将来 Wall/Opening/Solar も Element）
export interface Element {
  id: string;
  extensions?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface Vertex extends Element { x: number; y: number; }               // 平面座標（px）
export interface Edge extends Element { v: [string, string]; roleOverride?: EdgeRole; }
export interface Slope { pitch?: number; downhill?: { toEdgeId: string } | { azimuthDeg: number }; }
export interface FaceAttrs { trade: string; item: string; label?: string; }
export interface Face extends Element { boundary: string[]; slope: Slope; attrs: FaceAttrs; }

export type Point = { x: number; y: number };
export type AnnotationGeom = { point: Point } | { polyline: Point[] } | { region: Point[] };
export interface Annotation extends Element {
  kind: AnnotationKind;
  geom: AnnotationGeom;
  quantity?: { unit: string; value: number } | { deriveFrom: 'geom' };
}

export interface RoofModel {
  schemaVersion: 1;
  id: string;
  vertices: Vertex[];
  edges: Edge[];
  faces: Face[];
  annotations: Annotation[];
  properties: { name?: string; scale: number; roofType?: RoofType };
}

// ───── Evidence First な数量（value ＋ 根拠）。Geometry/Quantity/Drawing/Recognizer が共有する ─────
// 「この棟長7.28mはどこから？」→ evidence の element が光る。逆に element→どの数量に効くかも辿れる。
export interface QuantityEvidence {
  kind: 'face' | 'edge' | 'annotation' | 'gutter_run' | 'drop' | 'node' | 'segment';
  id: string;         // 根拠の要素 id（edge/face/eaveEdge/drop/route など。クリックで光らせる対象）
  contribution: number; // その要素がこの value に足した量（同じ unit）
}
export interface QuantityResult {
  key: string;        // 'roofArea' | 'ridgeLength' | 'hipLength' | 'valleyLength' | 'gableLength' | 'eaveLength' …
  label: string;      // 表示名（実屋根面積 / 棟長 …）
  value: number;      // 合計
  unit: string;       // '㎡' | 'm'
  evidence: QuantityEvidence[];
}

// ───────────────────────── 検証可能な素関数（式・派生・保存しない） ─────────────────────────

function vertexMap(m: RoofModel): Map<string, Vertex> { return new Map(m.vertices.map((v) => [v.id, v])); }
function edgeMap(m: RoofModel): Map<string, Edge> { return new Map(m.edges.map((e) => [e.id, e])); }

/** Face.boundary（順序付き edgeId 列）→ 順序付き頂点リング */
export function facePolygon(model: RoofModel, face: Face): Vertex[] {
  const V = vertexMap(model);
  const E = edgeMap(model);
  const es = face.boundary.map((id) => E.get(id)).filter((e): e is Edge => !!e);
  if (es.length < 2) return es.flatMap((e) => e.v.map((id) => V.get(id)).filter((v): v is Vertex => !!v));
  // 始点：edge0 の2頂点のうち edge1 と共有しない方
  const shared = es[0].v.find((id) => es[1].v.includes(id));
  let current = es[0].v.find((id) => id !== shared) ?? es[0].v[0];
  const ring: Vertex[] = [];
  for (const e of es) {
    const v = V.get(current);
    if (v) ring.push(v);
    const next = e.v.find((id) => id !== current);
    if (next == null) break;
    current = next;
  }
  return ring;
}

/** 面の平面積（px²・シューレース）。実面積は planArea × stretch.area(pitch)（別段で接続）。 */
export function faceArea(model: RoofModel, face: Face): number {
  const pts = facePolygon(model, face);
  if (pts.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** 辺の平面長（px）。 */
export function edgeLength(model: RoofModel, edge: Edge): number {
  const V = vertexMap(model);
  const a = V.get(edge.v[0]);
  const b = V.get(edge.v[1]);
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 各 edgeId を何枚の Face が使うか（1=境界辺、2=共有辺）。役割創発の入力。 */
export function edgeFaceCount(model: RoofModel): Map<string, number> {
  const c = new Map<string, number>();
  for (const f of model.faces) for (const eid of f.boundary) c.set(eid, (c.get(eid) ?? 0) + 1);
  return c;
}
export function isSharedEdge(model: RoofModel, edgeId: string): boolean {
  return (edgeFaceCount(model).get(edgeId) ?? 0) >= 2;
}

/**
 * Face を組み合わせて RoofModel を作る（「タイプを決める」ではなく「Face を置く」入口）。
 * 頂点・辺は自動で dedup（共有辺＝2面が同じ辺を参照する）。UI/Recognizer からの共通生成路。
 */
export function buildRoofModelFromFaces(
  faces: { vertices: Point[]; pitch?: number; attrs: FaceAttrs; eaveEdgeIndex?: number }[],
  opts: { scale: number; id?: string; name?: string },
): RoofModel {
  const vKey = new Map<string, string>();
  const vertices: Vertex[] = [];
  const keyOf = (p: Point) => `${Math.round(p.x)},${Math.round(p.y)}`; // 整数座標で dedup（共有辺の一致に必要）
  const getV = (p: Point): string => {
    const k = keyOf(p);
    let id = vKey.get(k);
    if (!id) { id = 'V-' + (vertices.length + 1); vKey.set(k, id); vertices.push({ id, x: Math.round(p.x), y: Math.round(p.y) }); }
    return id;
  };
  const eKey = new Map<string, string>();
  const edges: Edge[] = [];
  const getE = (a: string, b: string): string => {
    const k = [a, b].sort().join('|'); // 無向辺
    let id = eKey.get(k);
    if (!id) { id = 'E-' + (edges.length + 1); eKey.set(k, id); edges.push({ id, v: [a, b] }); }
    return id;
  };
  const outFaces: Face[] = faces.map((f, i) => {
    const vids = f.vertices.map(getV);
    const boundary: string[] = [];
    for (let j = 0; j < vids.length; j++) boundary.push(getE(vids[j], vids[(j + 1) % vids.length]));
    // 「面は自分の軒を指す」: eaveEdgeIndex の辺を downhill.toEdgeId に（役割創発の起点）
    const slope: Slope = { pitch: f.pitch };
    if (f.eaveEdgeIndex != null && boundary[f.eaveEdgeIndex]) slope.downhill = { toEdgeId: boundary[f.eaveEdgeIndex] };
    return { id: 'F-' + (i + 1), boundary, slope, attrs: f.attrs };
  });
  return {
    schemaVersion: 1, id: opts.id ?? 'R-1',
    vertices, edges, faces: outFaces, annotations: [],
    properties: { name: opts.name, scale: opts.scale },
  };
}
