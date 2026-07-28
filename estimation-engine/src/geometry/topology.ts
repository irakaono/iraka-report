// 甍AI Topology Compiler ＝ 共通幾何ランタイム（★屋根も建築も知らない。純粋トポロジのみ）。
//   ★これは「読む(Reader)」ではなく「入力プリミティブをフォーマット非依存の Topology IR へコンパイルする」処理。
//     Compiler 系列（Topology IR → Geometry IR → Quantity IR → Material IR → BOM）の先頭に一直線で並ぶ。
//   ★Architecture FROZEN（2026-07-28）：責務は Points / Segments / Loops / Adjacency / Containment / BBox まで。
//     「壁取り合い候補」「主屋根/下屋」「外に面する方位」は幾何ではなく建築の意味＝Plan Analyzer の仕事（ここには置かない）。
//   だから Topology IR は 屋根・基礎・外壁・部屋・土地境界・雨漏りOS の全てで使える＝**Geometry Runtime の契約**。
//
//   入力アダプタ（フォーマット依存）：Vector Reader … PDF/DWG/IFC/BIM/LiDAR/点群/写真 → VecReading（線/文字/円弧/寸法）。
//   幾何ランタイム（不変・FROZEN）  ：Topology Compiler … VecReading の線分 → TopologyIR。
//   正の設計：claude/RECOGNIZER-ARCHITECTURE.md（三層＋Plan Reader 二段／Topology Compiler Freeze）。

// ── Vector Reader（入力アダプタ）の出力：描いてある生プリミティブ。★推論しない。差し替えはここだけ。 ──
export interface VecSegment { x1: number; y1: number; x2: number; y2: number }
export interface VecText { str: string; x: number; y: number }
export interface VecReading {
  segments: VecSegment[];   // 線（軸平行を第一版で扱う）
  texts?: VecText[];        // 文字・寸法値
  northDeg?: number;        // 北矢印の向き（描いてある向き）。※方位=建築意味なので Analyzer へ素通しするだけ
}
export type VectorReader<TInput> = (input: TInput) => VecReading;

// ── Topology IR＝Topology Compiler の出力＝純粋トポロジ（屋根/建築を知らない・Geometry Runtime 契約）。 ──
export type Side = 'top' | 'right' | 'bottom' | 'left'; // ★幾何スクリーン基準（北ではない）。方位変換は Analyzer。
export interface Pt { x: number; y: number }
export interface Loop { id: string; rect: { x0: number; y0: number; x1: number; y1: number }; area: number } // 閉ループ（第一版＝矩形）
export interface LoopAdjacency { a: string; b: string; aSide: Side; bSide: Side }  // 2ループが辺を共有（幾何的事実）
export interface LoopContainment { outer: string; inner: string }                  // ループがループを内包（幾何的事実）
export interface TopologyIR {
  points: Pt[];
  segments: VecSegment[];
  loops: Loop[];
  adjacency: LoopAdjacency[];
  containment: LoopContainment[];
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

const EPS = 1e-6;
const near = (p: number, q: number) => Math.abs(p - q) < 1e-3;
interface Rect { x0: number; y0: number; x1: number; y1: number }

function covers(spans: { a: number; b: number }[], a: number, b: number): boolean {
  const merged = spans.slice().sort((p, q) => p.a - q.a);
  let cur = a;
  for (const s of merged) {
    if (s.a > cur + EPS) return false;
    if (s.b > cur) cur = s.b;
    if (cur >= b - EPS) return true;
  }
  return cur >= b - EPS;
}

// 軸平行の線分群から矩形の閉ループを復元（各辺が線分で覆われる最小矩形）。第一版：軸平行のみ。
export function rectsFromSegments(segments: VecSegment[]): Rect[] {
  const hByY = new Map<number, { a: number; b: number }[]>();
  const vByX = new Map<number, { a: number; b: number }[]>();
  const keyOf = (v: number, keys: number[]) => { for (const k of keys) if (near(k, v)) return k; keys.push(v); return v; };
  const yKeys: number[] = [], xKeys: number[] = [];
  for (const s of segments) {
    if (near(s.y1, s.y2)) { const y = keyOf(s.y1, yKeys); const a = Math.min(s.x1, s.x2), b = Math.max(s.x1, s.x2); const arr = hByY.get(y) ?? (hByY.set(y, []), hByY.get(y)!); arr.push({ a, b }); }
    else if (near(s.x1, s.x2)) { const x = keyOf(s.x1, xKeys); const a = Math.min(s.y1, s.y2), b = Math.max(s.y1, s.y2); const arr = vByX.get(x) ?? (vByX.set(x, []), vByX.get(x)!); arr.push({ a, b }); }
  }
  const xs = [...vByX.keys()].sort((a, b) => a - b);
  const ys = [...hByY.keys()].sort((a, b) => a - b);
  const cand: Rect[] = [];
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
    const x0 = xs[i], x1 = xs[j];
    for (let k = 0; k < ys.length; k++) for (let l = k + 1; l < ys.length; l++) {
      const y0 = ys[k], y1 = ys[l];
      if (!covers(vByX.get(x0)!, y0, y1) || !covers(vByX.get(x1)!, y0, y1)) continue;
      if (!covers(hByY.get(y0)!, x0, x1) || !covers(hByY.get(y1)!, x0, x1)) continue;
      cand.push({ x0, y0, x1, y1 });
    }
  }
  // 最小矩形だけ残す（他候補を内包する大枠は捨てる）。
  return cand.filter((r) => !cand.some((s) => s !== r && s.x0 >= r.x0 - EPS && s.x1 <= r.x1 + EPS && s.y0 >= r.y0 - EPS && s.y1 <= r.y1 + EPS && (s.x1 - s.x0) * (s.y1 - s.y0) < (r.x1 - r.x0) * (r.y1 - r.y0) - EPS));
}

const overlap1D = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > EPS;
const strictInside = (inner: Rect, outer: Rect) =>
  inner.x0 >= outer.x0 - EPS && inner.x1 <= outer.x1 + EPS && inner.y0 >= outer.y0 - EPS && inner.y1 <= outer.y1 + EPS &&
  (inner.x1 - inner.x0) * (inner.y1 - inner.y0) < (outer.x1 - outer.x0) * (outer.y1 - outer.y0) - EPS;

// Topology Compiler：線分 → Topology IR（Points/Segments/Loops/Adjacency/Containment/BBox）。★屋根も方位も知らない。
export function compileTopology(segments: VecSegment[]): TopologyIR {
  const rects = rectsFromSegments(segments);
  const loops: Loop[] = rects.map((r, i) => ({ id: `L${i + 1}`, rect: { ...r }, area: (r.x1 - r.x0) * (r.y1 - r.y0) }));
  // 点（ループ四隅の重複除去）。
  const seen = new Set<string>(); const points: Pt[] = [];
  for (const r of rects) for (const p of [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }]) {
    const k = `${Math.round(p.x * 1e3)},${Math.round(p.y * 1e3)}`; if (!seen.has(k)) { seen.add(k); points.push(p); }
  }
  // 隣接（辺の共有＝幾何的事実。どの辺かは Side で）。
  const adjacency: LoopAdjacency[] = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j], ai = loops[i].id, bi = loops[j].id;
    if (near(a.x1, b.x0) && overlap1D(a.y0, a.y1, b.y0, b.y1)) adjacency.push({ a: ai, b: bi, aSide: 'right', bSide: 'left' });
    else if (near(a.x0, b.x1) && overlap1D(a.y0, a.y1, b.y0, b.y1)) adjacency.push({ a: ai, b: bi, aSide: 'left', bSide: 'right' });
    else if (near(a.y1, b.y0) && overlap1D(a.x0, a.x1, b.x0, b.x1)) adjacency.push({ a: ai, b: bi, aSide: 'bottom', bSide: 'top' });
    else if (near(a.y0, b.y1) && overlap1D(a.x0, a.x1, b.x0, b.x1)) adjacency.push({ a: ai, b: bi, aSide: 'top', bSide: 'bottom' });
  }
  // 内包（ループの中にループ）。
  const containment: LoopContainment[] = [];
  for (let i = 0; i < rects.length; i++) for (let j = 0; j < rects.length; j++) {
    if (i !== j && strictInside(rects[j], rects[i])) containment.push({ outer: loops[i].id, inner: loops[j].id });
  }
  const bbox = rects.length
    ? { x0: Math.min(...rects.map((r) => r.x0)), y0: Math.min(...rects.map((r) => r.y0)), x1: Math.max(...rects.map((r) => r.x1)), y1: Math.max(...rects.map((r) => r.y1)) }
    : { x0: 0, y0: 0, x1: 0, y1: 0 };
  return { points, segments, loops, adjacency, containment, bbox };
}
