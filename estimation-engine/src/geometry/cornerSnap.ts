// 甍AI Corner Snap（Confirmation 支援）— Recognizer が作った Building Footprint Candidate を、
//   人が最小操作で確定するための「認識した壁の角へ吸着する」候補点を作る段。
//   ★これは認識アルゴリズムでも UI でもない。Human Confirmation Layer の支援：
//        Recognizer → Building Footprint Candidate → [Confirmation：角スナップ/ドラッグ/削除/追加] → Confirmed Footprint
//     （OUTLINE-RECOGNITION.md §1.4「人が庇・下屋・出窓を確認・修正（Phase E の角スナップ／編集）」）
//   ★純関数・UI/pdfjs/canvas 非依存（wallFilter.ts / contourTrace.ts と同じ思想）。入力座標系のまま出力する。
//     ブラウザ側 glue が「認識座標→キャンバス座標」へ写像し、snapToCorner はキャンバス座標＋pxしきい値で使う（座標系非依存）。

import type { WallSegment } from './wallFilter';
import type { Pt } from './contourTrace';

export interface CornerSnapOptions {
  cluster?: number;              // 近接点をまとめる半径（入力単位・L∞）。二重線の角ペアや粗いラスタ差を1点に。既定6。
  gap?: number;                  // H×V を「交わる」とみなす端の余裕（壁が角で正確に接しないことがある）。既定=cluster。
  includeEndpoints?: boolean;    // 壁線分の端点を角候補に含める。既定true。
  includeIntersections?: boolean;// H壁×V壁 の交点を角候補に含める。既定true。
}

// L∞ グリッドクラスタリング：セル幅=cluster。先に来た点（＝footprint 外形頂点＝アンカー）を優先して残し、
//   近接する壁由来の点はそこへマージ（落とす）。★アンカーを先頭に渡すことで外形頂点が必ず保存される。
export function clusterPoints(pts: Pt[], cluster: number): Pt[] {
  if (cluster <= 0) {
    const seen = new Set<string>(); const out: Pt[] = [];
    for (const p of pts) { const k = `${p.x},${p.y}`; if (!seen.has(k)) { seen.add(k); out.push({ x: p.x, y: p.y }); } }
    return out;
  }
  const cells = new Map<string, Pt[]>(); // セル→そのセルに残った代表点（通常1点）
  const out: Pt[] = [];
  for (const p of pts) {
    const cx = Math.round(p.x / cluster), cy = Math.round(p.y / cluster);
    let merged = false;
    for (let dx = -1; dx <= 1 && !merged; dx++) for (let dy = -1; dy <= 1 && !merged; dy++) {
      const arr = cells.get(`${cx + dx},${cy + dy}`);
      if (arr) for (const q of arr) { if (Math.abs(q.x - p.x) <= cluster && Math.abs(q.y - p.y) <= cluster) { merged = true; break; } }
    }
    if (merged) continue;
    const key = `${cx},${cy}`;
    const rep = { x: p.x, y: p.y };
    const arr = cells.get(key); if (arr) arr.push(rep); else cells.set(key, [rep]);
    out.push(rep);
  }
  return out;
}

// 認識した壁（＋任意で footprint 外形頂点）から「吸着する角の候補」を作る。
//   ★footprint 外形頂点はアンカー（確定した外形の角）として先頭に置き、必ず保存する。
//     壁の端点・H×V交点はノイズを含むので、アンカーと近接すればそこへマージされる。
export function wallCorners(walls: WallSegment[], footprint?: Pt[], opt: CornerSnapOptions = {}): Pt[] {
  const cluster = opt.cluster ?? 6;
  const gap = opt.gap ?? cluster;
  const includeEndpoints = opt.includeEndpoints ?? true;
  const includeIntersections = opt.includeIntersections ?? true;

  const anchors: Pt[] = [];
  const rest: Pt[] = [];
  if (footprint) for (const v of footprint) anchors.push({ x: v.x, y: v.y });

  if (includeEndpoints) {
    for (const w of walls) { rest.push({ x: w.x1, y: w.y1 }); rest.push({ x: w.x2, y: w.y2 }); }
  }
  if (includeIntersections) {
    const hs = walls.filter((w) => w.axis === 'h');
    const vs = walls.filter((w) => w.axis === 'v');
    for (const h of hs) {
      const hy = h.y1; const hx0 = Math.min(h.x1, h.x2) - gap, hx1 = Math.max(h.x1, h.x2) + gap;
      for (const v of vs) {
        const vx = v.x1; const vy0 = Math.min(v.y1, v.y2) - gap, vy1 = Math.max(v.y1, v.y2) + gap;
        if (vx >= hx0 && vx <= hx1 && hy >= vy0 && hy <= vy1) rest.push({ x: vx, y: hy });
      }
    }
  }
  return clusterPoints([...anchors, ...rest], cluster);
}

// 点 p を最も近い角へ吸着（threshold 内なら完全一致・外なら素通し）。
//   ★座標系非依存：キャンバス px でも入力単位でも同じに使える。ドラッグ中に呼ぶ。
export function snapToCorner(p: Pt, corners: Pt[], threshold: number): Pt {
  let best: Pt | null = null;
  let bestD = threshold;
  for (const c of corners) {
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best ? { x: best.x, y: best.y } : { x: p.x, y: p.y };
}
