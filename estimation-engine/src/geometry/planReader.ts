// 甍AI Plan Reader — 二段（Vector Reader → Geometry Reader）。★Reader は最後まで「読むだけ」。
//   PDF/DWG/IFC/BIM/LiDAR/点群/写真 … 入力が変わっても、差し替えるのは Vector Reader（入力アダプタ）だけ。
//   Geometry Reader 以降（Geometry Reader → Plan Analyzer → Reconciler）は無変更。
//   正の設計：claude/RECOGNIZER-ARCHITECTURE.md（三層＋Plan Reader 二段）。
//
//   PDF → [Vector Reader] VecReading(線/文字/円弧/寸法) → [Geometry Reader] PlanReading(閉領域/外周/壁接続/壁取り合い候補)
//         → [Plan Analyzer] analyzePlan → RoofUnit候補 → [Reconciler] reconcileRoofConfig → RoofConfiguration
import type { Dir } from './roofConfig';
import type { PlanReading, PlanRegion } from './recognizer';

// ── Vector Reader（入力アダプタ）の出力：描いてある生プリミティブ（線・文字・北矢印の向き）。★推論しない。 ──
export interface VecSegment { x1: number; y1: number; x2: number; y2: number }
export interface VecText { str: string; x: number; y: number }
export interface VecReading {
  segments: VecSegment[];   // 線（壁・柱・通り芯・外周…の線分）。軸平行を第一版で扱う
  texts?: VecText[];        // 文字・寸法値
  northDeg?: number;        // 北矢印の向き（描いてある向き。無ければ後段で立面名称→確認）
}
// Vector Reader の契約：入力（PDFページ/DWG/IFC…）→ VecReading。フォーマット依存はこの実装だけ。
export type VectorReader<TInput> = (input: TInput) => VecReading;

// ── Geometry Reader：VecReading（線分）→ PlanReading（閉領域・外周・壁取り合い候補）。★純粋な幾何・推論しない。 ──
//   「主屋根/下屋」の判断はしない（それは Plan Analyzer）。ここは「閉じた領域が在る／辺が他領域と接する」まで。
//   方位は幾何スクリーン基準（上=north/右=east/下=south/左=west）の暫定。真北補正は Analyzer/Reconciler（§2.5）。
const EPS = 1e-6;
interface Rect { x0: number; y0: number; x1: number; y1: number }

// 線上に、区間 [a,b] を覆う線分（併合可）が在るか。
function covers(spans: { a: number; b: number }[], a: number, b: number): boolean {
  const merged = spans.slice().sort((p, q) => p.a - q.a);
  let cur = a;
  for (const s of merged) {
    if (s.a > cur + EPS) return false;         // 隙間
    if (s.b > cur) cur = s.b;
    if (cur >= b - EPS) return true;
  }
  return cur >= b - EPS;
}

// 軸平行の線分群から矩形領域を復元（各辺が線分で覆われている最小矩形）。第一版：軸平行のみ。
export function rectsFromSegments(segments: VecSegment[]): Rect[] {
  const near = (p: number, q: number) => Math.abs(p - q) < 1e-3;
  // 水平線（y一定）を y ごと、垂直線（x一定）を x ごとに束ねる。
  const hByY = new Map<number, { a: number; b: number }[]>();
  const vByX = new Map<number, { a: number; b: number }[]>();
  const keyOf = (v: number, keys: number[]) => { for (const k of keys) if (near(k, v)) return k; keys.push(v); return v; };
  const yKeys: number[] = [], xKeys: number[] = [];
  for (const s of segments) {
    if (near(s.y1, s.y2)) { const y = keyOf(s.y1, yKeys); const a = Math.min(s.x1, s.x2), b = Math.max(s.x1, s.x2); (hByY.get(y) ?? hByY.set(y, []).get(y)!).push({ a, b }); }
    else if (near(s.x1, s.x2)) { const x = keyOf(s.x1, xKeys); const a = Math.min(s.y1, s.y2), b = Math.max(s.y1, s.y2); (vByX.get(x) ?? vByX.set(x, []).get(x)!).push({ a, b }); }
    // 斜線は第一版では無視（VecReading をアダプタが軸平行へ正規化する前提）
  }
  const xs = [...xByKeys(vByX)].sort((a, b) => a - b);
  const ys = [...hByY.keys()].sort((a, b) => a - b);
  const cand: Rect[] = [];
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
    const x0 = xs[i], x1 = xs[j];
    for (let k = 0; k < ys.length; k++) for (let l = k + 1; l < ys.length; l++) {
      const y0 = ys[k], y1 = ys[l];
      if (!covers(vByX.get(x0)!, y0, y1) || !covers(vByX.get(x1)!, y0, y1)) continue; // 左右の縦辺
      if (!covers(hByY.get(y0)!, x0, x1) || !covers(hByY.get(y1)!, x0, x1)) continue; // 上下の横辺
      cand.push({ x0, y0, x1, y1 });
    }
  }
  // 最小矩形だけ残す（他の候補を内包する＝分割された大枠は捨てる）。
  return cand.filter((r) => !cand.some((s) => s !== r && s.x0 >= r.x0 - EPS && s.x1 <= r.x1 + EPS && s.y0 >= r.y0 - EPS && s.y1 <= r.y1 + EPS && (s.x1 - s.x0) * (s.y1 - s.y0) < (r.x1 - r.x0) * (r.y1 - r.y0) - EPS));
}
function xByKeys(m: Map<number, unknown>): number[] { return [...m.keys()]; }

export function readGeometry(vec: VecReading): PlanReading {
  const rects = rectsFromSegments(vec.segments);
  if (!rects.length) return { regions: [], ...(vec.northDeg != null ? { northDeg: vec.northDeg } : {}) };
  const bx0 = Math.min(...rects.map((r) => r.x0)), bx1 = Math.max(...rects.map((r) => r.x1));
  const by0 = Math.min(...rects.map((r) => r.y0)), by1 = Math.max(...rects.map((r) => r.y1));
  const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > EPS;
  const regions: PlanRegion[] = rects.map((r, i) => {
    // 外周に接する辺＝外に面する方位（暫定：上=north/右=east/下=south/左=west）。
    const facing: Dir[] = [];
    if (Math.abs(r.y0 - by0) < 1e-3) facing.push('north');
    if (Math.abs(r.x1 - bx1) < 1e-3) facing.push('east');
    if (Math.abs(r.y1 - by1) < 1e-3) facing.push('south');
    if (Math.abs(r.x0 - bx0) < 1e-3) facing.push('west');
    // 他の矩形の辺と一致する辺＝壁取り合い候補（内部で接する壁）。
    const wallSides: Dir[] = [];
    for (const s of rects) {
      if (s === r) continue;
      if (Math.abs(s.x0 - r.x1) < 1e-3 && overlap(r.y0, r.y1, s.y0, s.y1)) wallSides.push('east');
      if (Math.abs(s.x1 - r.x0) < 1e-3 && overlap(r.y0, r.y1, s.y0, s.y1)) wallSides.push('west');
      if (Math.abs(s.y1 - r.y0) < 1e-3 && overlap(r.x0, r.x1, s.x0, s.x1)) wallSides.push('north');
      if (Math.abs(s.y0 - r.y1) < 1e-3 && overlap(r.x0, r.x1, s.x0, s.x1)) wallSides.push('south');
    }
    return {
      id: `G${i + 1}`,
      area: (r.x1 - r.x0) * (r.y1 - r.y0),
      ...(facing.length ? { facing: [...new Set(facing)] } : {}),
      ...(wallSides.length ? { wallSides: [...new Set(wallSides)] } : {}),
    };
  });
  return { regions, ...(vec.northDeg != null ? { northDeg: vec.northDeg } : {}) };
}
