// 甍AI Phase F / F-3 Roof Face Generator（Ver1-1）— Roof Outline → 既存 RoofModel（屋根面を置く）。
//   ★責務（PHASE-F-ROOF-ANALYZER.md §8）：屋根外形を面へ分割し、各面が自分の軒辺を指すところまで。
//     - **新 IR を定義しない。** 出力は既存 `RoofModel`（`buildRoofModelFromFaces` 経由の共有辺グラフ）。
//       面ごとに polygon を持たない（`Face.boundary` = 辺ID列）。棟/谷は「2面が共有する1本の辺」。
//     - **EdgeRole を格納しない。** ridge/hip/valley/eave/gable は `roofEngine.edgeRole()` が創発する。
//       F-3 は「面を置く＋勾配を割る＋各面の軒を指す（`slope.downhill.toEdgeId`）」まで。
//   ★入力＝Roof Outline（Resolver の確定 polygon）＋ ElevationSpec[]（recognizer R-2a・方位別勾配）。
//
//   ★Ver1-1（外形忠実度だけを上げる刻み）：bbox 近似をやめ、**Resolver Outline を長辺方向の棟線でクリップして
//     Outline-following な2面**を作る（棟＝長辺方向・上下/左右2面・各外側辺＝軒）。凹み（reflex）は外周ジョグとして
//     保持し、`eave/gable` の創発に委ねる。★**valley（谷）はまだ作らない**——谷は「2面が共有する内部辺」として
//     Ver1-3 で意図的に生成する（Ver1-1 と Ver1-3 の責務を混ぜない＝回帰と原因追跡をきれいに保つ）。
//   ★受入基準は「伝法邸を当てる」ではなく「Resolver Outline を**欠損・重複なく2面の共有辺グラフへ写像**できる」こと。
//     一次の正＝**面積保存（Σ 面 planar 面積 = Outline 面積）**。伝法邸はその最初の Canonical Evidence。
//   ★安全弁：クリップ結果が次を満たさない場合だけ Ver0 bbox 切妻へフォールバック（退化しない）：
//       (1) 面がちょうど2つ  (2) 各面が有効な単純（矩形整合）ポリゴン  (3) 両面が同じ棟辺を1本共有  (4) 面積保存が許容差内。
//   ★pitch は単一 fallback（ElevationSpec の最頻値／無ければ既定）。★面ごと方位別 pitch は Ver1-2。純関数・UI 非依存。

import type { Pt } from './contourTrace';
import type { Point, RoofModel, FaceAttrs } from './roofModel';
import { buildRoofModelFromFaces, edgeFaceCount } from './roofModel';
import { roleCounts } from './roofEngine';
import { offsetPolygonOutward } from './elevationInference';
import type { ElevationSpec } from './recognizer';

export interface RoofFacesOptions {
  scale?: number;      // RoofModel の縮尺（px→m 等・既定 1）。
  pitch?: number;      // 明示 pitch（寸・優先）。無ければ elevation → 既定。
  attrs?: FaceAttrs;   // 面の属性（trade/item）。既定＝屋根葺き。
  id?: string;
  name?: string;
}

const DEFAULT_PITCH = 5;                                        // 寸（preset と同じ既定）。
const DEFAULT_ATTRS: FaceAttrs = { trade: '屋根工事', item: 'roof_field' };
const EPS = 1e-6;

// ElevationSpec[] から単一 pitch を拾う（Ver0 fallback＝最頻値／同数なら小さい方）。
//   ★方位別割当（面の下り方位 ↔ dir）は Ver1-2。Ver1-1 は全面同一 pitch。
export function pickPitch(elevation?: ElevationSpec[], fallback: number = DEFAULT_PITCH): number {
  const all = (elevation ?? []).flatMap((e) => e.pitches).filter((p) => p > 0);
  if (!all.length) return fallback;
  const freq = new Map<number, number>();
  all.forEach((p) => freq.set(p, (freq.get(p) ?? 0) + 1));
  return [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

function bboxOf(poly: Pt[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of poly) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1 };
}

// F-3 の面入力（vertices/pitch/eave）。★役割は付けない・各面が自分の軒を指す。
export interface RoofFaceInput { vertices: Point[]; pitch: number; eaveEdgeIndex: number }

// ───────────────────────── 幾何ヘルパ（純関数） ─────────────────────────

function polyArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p.x * q.y - q.x * p.y; }
  return Math.abs(a) / 2;
}

// Sutherland–Hodgman：単純ポリゴンを半平面（axis>=mid / axis<=mid）でクリップ。rectilinear 入力では交点は整数。
function clipHalf(poly: Pt[], axis: 'x' | 'y', mid: number, side: 1 | -1): Pt[] {
  const inside = (p: Pt) => (side === 1 ? p[axis] >= mid - EPS : p[axis] <= mid + EPS);
  const cut = (a: Pt, b: Pt): Pt => {
    const t = (mid - a[axis]) / (b[axis] - a[axis]);
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  };
  const out: Pt[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const cur = poly[i], nxt = poly[(i + 1) % n];
    const ci = inside(cur), ni = inside(nxt);
    if (ci) out.push({ x: cur.x, y: cur.y });
    if (ci !== ni) out.push(cut(cur, nxt));
  }
  return out;
}

// 連続重複点の除去。
function dedupeRing(poly: Pt[]): Pt[] {
  const out: Pt[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    if (Math.abs(a.x - b.x) < 1e-4 && Math.abs(a.y - b.y) < 1e-4) continue;
    out.push({ x: a.x, y: a.y });
  }
  return out;
}

// 共線3点の中点を落とす（棟境界の中間点を畳んで「棟辺1本」にする／ジョグ=L字は残す）。
function mergeCollinear(poly: Pt[]): Pt[] {
  let pts = poly.slice();
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    const out: Pt[] = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
      const crossp = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      const len = Math.hypot(c.x - a.x, c.y - a.y);
      if (len > EPS && Math.abs(crossp) < 1e-3 * Math.max(1, len)) { changed = true; continue; }
      out.push(b);
    }
    if (out.length >= 3) pts = out; else break;
  }
  return pts;
}

const cleanRing = (poly: Pt[]): Pt[] => mergeCollinear(dedupeRing(poly));

// 全辺が軸平行（斜辺なし）かつ零長辺なし＝矩形整合な単純ポリゴンの必要条件。
function isRectilinear(poly: Pt[]): boolean {
  const n = poly.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
    if (dx > 1e-3 && dy > 1e-3) return false; // 斜辺
    if (dx < 1e-3 && dy < 1e-3) return false; // 零長
  }
  return true;
}

// 外側の軒辺 index：軒＝流れに直交する辺（split 軸で一定な辺）。extreme 側（min/max）を選ぶ＝確実に外周。
function outerEaveIndex(poly: Pt[], axis: 'x' | 'y', outer: 'min' | 'max'): number {
  let idx = -1, best = outer === 'min' ? Infinity : -Infinity;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    if (Math.abs(a[axis] - b[axis]) > 1e-3) continue;     // 軸方向に変化する辺は軒ではない
    const v = a[axis];
    if (outer === 'min' ? v < best : v > best) { best = v; idx = i; }
  }
  return idx;
}

const roundPts = (poly: Pt[]): Point[] => poly.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));

// Ver1-1 本体：Outline を長辺方向の棟線でクリップ→2面。安全弁を通らなければ null（=呼び出し側が bbox へ）。
function outlineFaceInputs(outline: Pt[], pitch: number): RoofFaceInput[] | null {
  if (!outline || outline.length < 4) return null;
  const { x0, y0, x1, y1 } = bboxOf(outline);
  const w = x1 - x0, h = y1 - y0;
  if (w < EPS || h < EPS) return null;
  const vertical = h > w;                                  // 棟は長辺方向。縦長→棟は縦（split 軸 = x）。
  const axis: 'x' | 'y' = vertical ? 'x' : 'y';
  const mid = Math.round(vertical ? (x0 + x1) / 2 : (y0 + y1) / 2);

  // (安全弁) 棟線が外形境界をまたぐのはちょうど2箇所か（=左右/上下が単連結に割れる）。
  let crossings = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    if ((a[axis] - mid) * (b[axis] - mid) < -EPS) crossings++;
  }
  if (crossings !== 2) return null;

  // clip → clean(float) → round → clean(int)：整数リングを確定してから軒 index を取る。
  //   ★丸めで辺が1本潰れても buildRoofModelFromFaces の boundary と index がズレない（棟ロールが壊れない）。
  const A = cleanRing(roundPts(cleanRing(clipHalf(outline, axis, mid, -1))));   // axis<=mid（左／上）
  const B = cleanRing(roundPts(cleanRing(clipHalf(outline, axis, mid, +1))));   // axis>=mid（右／下）
  // (安全弁) 各面が単純（矩形整合）ポリゴンか。
  if (A.length < 4 || B.length < 4) return null;
  if (!isRectilinear(A) || !isRectilinear(B)) return null;
  // (安全弁) 面積保存：Σ 面 = Outline（欠損・重複を機械検知。整数丸め分の許容差）。
  const total = polyArea(outline);
  if (Math.abs(polyArea(A) + polyArea(B) - total) > Math.max(2, total * 2e-3)) return null;

  const eaveA = outerEaveIndex(A, axis, 'min');
  const eaveB = outerEaveIndex(B, axis, 'max');
  if (eaveA < 0 || eaveB < 0) return null;

  const faces: RoofFaceInput[] = [
    { vertices: A as Point[], pitch, eaveEdgeIndex: eaveA },
    { vertices: B as Point[], pitch, eaveEdgeIndex: eaveB },
  ];

  // (安全弁) 共有辺グラフで検証：2面・棟辺1本・斜辺なし。
  const m = buildRoofModelFromFaces(
    faces.map((f) => ({ vertices: f.vertices, pitch: f.pitch, attrs: DEFAULT_ATTRS, eaveEdgeIndex: f.eaveEdgeIndex })),
    { scale: 1 },
  );
  if (m.faces.length !== 2) return null;
  if ([...edgeFaceCount(m).values()].filter((c) => c >= 2).length !== 1) return null;
  const V = new Map(m.vertices.map((v) => [v.id, v]));
  for (const e of m.edges) {
    const a = V.get(e.v[0]), b = V.get(e.v[1]);
    if (!a || !b) return null;
    if (Math.abs(a.x - b.x) > 1e-3 && Math.abs(a.y - b.y) > 1e-3) return null; // 斜辺
  }
  // (安全弁・★核心) 役割が **clean gable** で創発するか：棟ちょうど1本・谷/隅棟なし・軒/ケラバあり。
  //   ＝「中央に棟1本」を code で保証。満たさなければ bbox 切妻へフォールバック（bbox は必ず棟が出る）。
  const rc = roleCounts(m);
  if (rc.ridge !== 1 || (rc.valley ?? 0) !== 0 || (rc.hip ?? 0) !== 0 || (rc.eave ?? 0) < 1 || (rc.gable ?? 0) < 1) return null;
  return faces;
}

// Ver0 fallback：外形 bbox に切妻を1本（ridge＝長辺方向・上下/左右2面・各外側辺＝軒＝eaveEdgeIndex 0）。
function bboxFaceInputs(outline: Pt[], pitch: number): RoofFaceInput[] {
  const { x0, y0, x1, y1 } = bboxOf(outline);
  const w = x1 - x0, h = y1 - y0;
  if (w >= h) {
    const midY = (y0 + y1) / 2;
    return [
      { vertices: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: midY }, { x: x0, y: midY }], pitch, eaveEdgeIndex: 0 },
      { vertices: [{ x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: midY }, { x: x1, y: midY }], pitch, eaveEdgeIndex: 0 },
    ];
  }
  const midX = (x0 + x1) / 2;
  return [
    { vertices: [{ x: x0, y: y1 }, { x: x0, y: y0 }, { x: midX, y: y0 }, { x: midX, y: y1 }], pitch, eaveEdgeIndex: 0 },
    { vertices: [{ x: x1, y: y0 }, { x: x1, y: y1 }, { x: midX, y: y1 }, { x: midX, y: y0 }], pitch, eaveEdgeIndex: 0 },
  ];
}

// F-3 core：Roof Outline → 屋根面の入力列（Ver1-1＝外形なり2面／不成立時のみ Ver0 bbox）。
//   ★配線の接続点：Studio はこの列を編集状態（faces）に持ち、buildRoofModelFromFaces で RoofModel を組む。
export function roofFaceInputs(outline: Pt[], elevation?: ElevationSpec[], opts: { pitch?: number } = {}): RoofFaceInput[] {
  const pitch = opts.pitch ?? pickPitch(elevation);
  return outlineFaceInputs(outline, pitch) ?? bboxFaceInputs(outline, pitch);
}

// 軒の出（overhang）を屋根面へ反映する：各面を外側へ dpx 平行拡張する。
//   ★共有辺グラフを壊さない：**2面が共有する頂点（棟・谷の内部辺）は動かさない**。
//     軒の出で外へ出るのは軒/ケラバ端だけで、棟（建物中央の稜線）は動かないのが物理的にも正しい。
//     面ごとに素朴に offsetPolygonOutward すると共有頂点が各面バラバラに動き、棟が「共有でなくなって消える」ため必須。
//   ★純関数。faces は {vertices} を持つ任意型（RoofFaceInput / Studio FaceInput）を受けて同型を返す。
export function offsetRoofFacesOutward<T extends { vertices: Point[] }>(faces: T[], dpx: number): T[] {
  if (!dpx || faces.length === 0) return faces;
  const key = (p: Point) => `${Math.round(p.x)},${Math.round(p.y)}`;
  const count = new Map<string, number>();
  for (const f of faces) for (const v of f.vertices) count.set(key(v), (count.get(key(v)) ?? 0) + 1);
  const shared = new Set([...count.entries()].filter(([, c]) => c > 1).map(([k]) => k)); // 2面以上が共有＝内部辺（棟/谷）の頂点
  return faces.map((f) => {
    const moved = offsetPolygonOutward(f.vertices, dpx);
    const vertices: Point[] = moved.map((p, i) =>
      shared.has(key(f.vertices[i]))
        ? { x: f.vertices[i].x, y: f.vertices[i].y }          // 共有頂点は固定（棟を動かさない）
        : { x: Math.round(p.x), y: Math.round(p.y) },         // 外周（軒/ケラバ）だけ外へ
    );
    return { ...f, vertices };
  });
}

// Roof Outline → RoofModel（F-3）。roofFaceInputs に attrs（costing）を足して共有辺グラフを組む。★役割は付けない（創発）。
export function generateRoofFaces(outline: Pt[], elevation?: ElevationSpec[], opts: RoofFacesOptions = {}): RoofModel {
  const scale = opts.scale ?? 1;
  const attrs = opts.attrs ?? DEFAULT_ATTRS;
  const faces = roofFaceInputs(outline, elevation, { pitch: opts.pitch }).map((f) => ({ ...f, attrs }));
  return buildRoofModelFromFaces(faces, { scale, id: opts.id, name: opts.name });
}
