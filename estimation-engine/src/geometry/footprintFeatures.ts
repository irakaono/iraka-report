// 甍AI Phase F / F-1 Footprint Feature Extractor — Building Footprint Candidate → Footprint Feature IR。
//   ★責務 LOCK（PHASE-F-ROOF-ANALYZER.md F#2/F#11）：**判断しない・名前を付けない**。幾何を Feature IR へ写像するだけ。
//     ここに「ポーチ/庇/下屋/出窓」という語は一切出てこない。それは F-2 Roof Analyzer（Semantic）の責務。
//   ★Feature IR は Geometry IR であって Semantic IR ではない。Topology Compiler が純トポロジで止まるのと同型。
//   ★純関数・UI/pdfjs 非依存。入力は Polygon だが、Feature は Geometry に依存する（F#7a）——将来 Graph/Surface からも作りうる。
//
//   出力（Footprint Feature IR）：vertices（内角・出角/入角）／edges（長さ・方位・長辺/短辺）／
//     protrusions・notches（矩形の張り出し/凹み：奥行・幅・比率・関与辺）／rectangularity（矩形性）／perimeter／bbox／area。

import type { Pt } from './contourTrace';

export type Axis = 'h' | 'v' | 'diag';

export interface FeatureVertex {
  x: number; y: number;
  interiorAngleDeg: number;  // 内角（度）。convex=<180（出角）／concave=>180（入角）。
  convex: boolean;           // 出角(凸)=true ／ 入角(凹・reflex)=false。★判定名ではなく幾何量。
}
export interface FeatureEdge {
  a: Pt; b: Pt; length: number; axis: Axis;
  longest: boolean; shortest: boolean;
}
// 矩形の張り出し/凹み（tab）。★「ポーチ」等の意味は付けない。位置・奥行・幅・比率だけ。
export interface FeatureTab {
  capMid: Pt;                // 先端辺（cap）の中点＝tab の位置
  depth: number;             // 奥行（baseline から cap までの深さ）
  width: number;             // 幅（cap の長さ）
  ratio: number;             // 比率＝奥行/幅
  depthAxis: Axis;           // 奥行方向の軸（'h'|'v'）
  edgeIndices: [number, number, number]; // 関与辺 [depth1, cap, depth2] の edges index
}
export interface GeometryFeature {
  vertices: FeatureVertex[];
  edges: FeatureEdge[];
  protrusions: FeatureTab[]; // 外側へ張り出し
  notches: FeatureTab[];     // 内側へ凹み
  rectangularity: number;    // 矩形性＝area / bboxArea（0..1]。1=完全な矩形。
  perimeter: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  area: number;              // 多角形面積（絶対値）
}

const EPS = 1e-6;

function signedArea(poly: Pt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a.x * b.y - b.x * a.y; }
  return s / 2;
}

function axisOf(a: Pt, b: Pt): Axis {
  const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
  if (dy < EPS && dx >= EPS) return 'h';
  if (dx < EPS && dy >= EPS) return 'v';
  return 'diag';
}

// Building Footprint Candidate（閉ポリゴン・first≠last）→ Footprint Feature IR。★判断しない。
export function geometryFeatures(polygon: Pt[]): GeometryFeature {
  const poly = polygon.map((p) => ({ x: p.x, y: p.y }));
  const n = poly.length;
  const bbox = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const p of poly) { bbox.x0 = Math.min(bbox.x0, p.x); bbox.y0 = Math.min(bbox.y0, p.y); bbox.x1 = Math.max(bbox.x1, p.x); bbox.y1 = Math.max(bbox.y1, p.y); }
  const area = Math.abs(signedArea(poly));
  const orient = Math.sign(signedArea(poly)) || 1; // ポリゴンの回り向き（座標系非依存で convex 判定に使う）

  // ── vertices：内角・出角/入角 ──
  const vertices: FeatureVertex[] = [];
  for (let i = 0; i < n; i++) {
    const p = poly[(i - 1 + n) % n], v = poly[i], q = poly[(i + 1) % n];
    const inx = v.x - p.x, iny = v.y - p.y;   // 入ってくるベクトル
    const oux = q.x - v.x, ouy = q.y - v.y;   // 出ていくベクトル
    const cross = inx * ouy - iny * oux;
    const dot = inx * oux + iny * ouy;
    const turnDeg = Math.atan2(cross, dot) * 180 / Math.PI; // 進行方向の回転角（符号付き）
    const convex = orient * turnDeg > 0;                    // 回り向きと同符号なら出角
    const interiorAngleDeg = 180 - orient * turnDeg;        // <180=出角 ／ >180=入角
    vertices.push({ x: v.x, y: v.y, interiorAngleDeg, convex });
  }

  // ── edges：長さ・方位・長辺/短辺 ──
  const edges: FeatureEdge[] = [];
  let perimeter = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    perimeter += length;
    edges.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, length, axis: axisOf(a, b), longest: false, shortest: false });
  }
  if (edges.length) {
    let li = 0, si = 0;
    for (let i = 1; i < edges.length; i++) { if (edges[i].length > edges[li].length) li = i; if (edges[i].length < edges[si].length) si = i; }
    edges[li].longest = true; edges[si].shortest = true;
  }

  // ── protrusions / notches：矩形 tab 検出（判断しない・位置と寸法だけ） ──
  //   tab = 連続3辺 [depth1, cap, depth2]：depth1∥depth2 で逆向き（出て戻る）・cap は直交。
  //   奥行=min(|depth1|,|depth2|)・幅=|cap|。tab 中心が内側→張り出し／外側→凹み。
  //   ★凸凹パターンで本体/腕の誤検出を除外：張り出し＝付け根2頂点が入角・先端2頂点が出角／凹み＝その逆。
  const protrusions: FeatureTab[] = [];
  const notches: FeatureTab[] = [];
  for (let i = 0; i < n; i++) {
    const e0 = edges[i], e1 = edges[(i + 1) % n], e2 = edges[(i + 2) % n];
    if (e0.axis === 'diag' || e1.axis === 'diag' || e2.axis === 'diag') continue;
    if (e0.axis !== e2.axis) continue;      // depth 辺どうしは同軸
    if (e1.axis === e0.axis) continue;      // cap は直交
    const d0x = Math.sign(e0.b.x - e0.a.x), d0y = Math.sign(e0.b.y - e0.a.y);
    const d2x = Math.sign(e2.b.x - e2.a.x), d2y = Math.sign(e2.b.y - e2.a.y);
    if (!(d0x === -d2x && d0y === -d2y)) continue; // 逆向き（出て戻る）
    // ★4頂点の凸凹で張り出し/凹みを分ける（本体・腕を弾く肝）。A=付け根, B/C=先端, D=付け根（poly[i..i+3]）。
    //   張り出し＝付け根2頂点が入角・先端2頂点が出角／凹み＝その逆。等奥行きは要求しない（段差状のポーチ等も拾う）。
    const A = vertices[i].convex, B = vertices[(i + 1) % n].convex, C = vertices[(i + 2) % n].convex, D = vertices[(i + 3) % n].convex;
    const isProtrusion = !A && B && C && !D;  // 付け根=入角・先端=出角
    const isNotch = A && !B && !C && D;       // 付け根=出角・先端=入角
    if (!isProtrusion && !isNotch) continue;
    const depth = Math.min(e0.length, e2.length), width = e1.length; // 奥行=浅い側（段差でも代表値）
    if (depth < EPS || width < EPS) continue;
    const capMid = { x: (e1.a.x + e1.b.x) / 2, y: (e1.a.y + e1.b.y) / 2 };
    const tab: FeatureTab = {
      capMid, depth, width, ratio: width > EPS ? depth / width : 0,
      depthAxis: e0.axis, edgeIndices: [i, (i + 1) % n, (i + 2) % n],
    };
    if (isProtrusion) protrusions.push(tab); else notches.push(tab);
  }

  const bboxArea = Math.max(EPS, (bbox.x1 - bbox.x0) * (bbox.y1 - bbox.y0));
  const rectangularity = area / bboxArea;

  return { vertices, edges, protrusions, notches, rectangularity, perimeter, bbox, area };
}
