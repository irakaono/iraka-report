// スナップ（world座標）: ①既存頂点へ吸着 ②水平/垂直
import type { Vertex } from './types';

export interface SnapCtx {
  targets: Vertex[]; // 吸着候補（既存の全頂点など）
  prev?: Vertex;     // 直前の頂点（ortho の基準）
  ortho: boolean;    // Shift 等で水平/垂直ロック
  threshold: number; // world 単位のしきい値（画面px / zoom）
}

export function snap(p: Vertex, ctx: SnapCtx): Vertex {
  let x = p[0];
  let y = p[1];

  // ① 既存頂点へ吸着（最近傍がしきい値内なら完全一致）
  let best: Vertex | null = null;
  let bestD = ctx.threshold;
  for (const t of ctx.targets) {
    const d = Math.hypot(t[0] - x, t[1] - y);
    if (d < bestD) { bestD = d; best = t; }
  }
  if (best) return [best[0], best[1]];

  // ② 直前点から水平/垂直
  if (ctx.prev) {
    const dx = Math.abs(x - ctx.prev[0]);
    const dy = Math.abs(y - ctx.prev[1]);
    if (ctx.ortho) {
      if (dx < dy) x = ctx.prev[0]; else y = ctx.prev[1];
    } else {
      if (dx < ctx.threshold) x = ctx.prev[0];
      else if (dy < ctx.threshold) y = ctx.prev[1];
    }
  }
  return [x, y];
}
