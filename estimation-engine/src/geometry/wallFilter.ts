// 甍AI Noise Reduction（現実装＝二重線 Wall Filter）— Recognizer パイプラインの「壁だけ残す」段。
//   ★責務は「認識器」ではなく「ノイズ除去器」。Vector Reader が出した線分から、壁でないもの
//     （通り芯・寸法線・建具・家具・文字・設備の線）を落とし、壁候補だけを Contour Tracer へ渡す。
//   ★純関数・UI/pdfjs 非依存（pdfText.ts / vectorReader.ts と同じ思想）。
//   正の設計：claude/OUTLINE-RECOGNITION.md（O#3 責務＝Noise Reduction／O#4 二重線採用）。
//
//   現実装の判別：壁は「壁厚(≈WT)で平行にペアになった二重線」。
//     - 通り芯（910mm≈43pt離れ）＝ペア距離が大きすぎ → 落ちる。
//     - 寸法線＝単線（平行ペアなし）→ 落ちる。
//   将来ここに「レイヤ情報／線種／線幅／AI分類」を足しても、責務（ノイズ除去）と出力(WallSegment[])は不変。

import type { VecSegment } from './topology';

export type Axis = 'h' | 'v';
export interface WallSegment { x1: number; y1: number; x2: number; y2: number; axis: Axis }

export interface WallFilterOptions {
  wtMin?: number;      // 壁厚ペアの最小距離(PDF単位)。既定3。これ未満は同一線/重複とみなし無視。
  wtMax?: number;      // 壁厚ペアの最大距離。既定12。これ超（通り芯等）は非壁。
  minOverlap?: number; // ペアの投影オーバーラップ最小長。既定12。短い偶然の平行を排除。
  minLen?: number;     // これ未満の線は端から除外（文字・目盛のヒゲ）。既定6。
}

const EPS = 1e-3;
const isH = (s: VecSegment) => Math.abs(s.y1 - s.y2) < EPS;
const isV = (s: VecSegment) => Math.abs(s.x1 - s.x2) < EPS;
const segLen = (s: VecSegment) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);

interface Norm { c: number; a: number; b: number; idx: number } // c=一定座標, [a,b]=伸びる範囲, idx=元配列index

// 平行ペア（壁厚距離＋投影オーバーラップ）を持つ線だけを keep に入れる。
function markPaired(items: Norm[], wtMin: number, wtMax: number, minOverlap: number, keep: Set<number>) {
  items.sort((p, q) => p.c - q.c || p.a - q.a);
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const d = items[j].c - items[i].c;
      if (d < wtMin) continue;      // 近すぎ（同一/重複線）
      if (d > wtMax) break;         // c 昇順なので以降はさらに遠い＝非壁
      const ov = Math.min(items[i].b, items[j].b) - Math.max(items[i].a, items[j].a);
      if (ov >= minOverlap) { keep.add(items[i].idx); keep.add(items[j].idx); }
    }
  }
}

// Vector Reader の線分 → 壁候補（WallSegment[]）。★軸平行のみ扱う第一版（斜め壁は将来）。
export function wallFilter(segments: VecSegment[], opt: WallFilterOptions = {}): WallSegment[] {
  const wtMin = opt.wtMin ?? 3, wtMax = opt.wtMax ?? 12, minOverlap = opt.minOverlap ?? 12, minLen = opt.minLen ?? 6;
  const hs: Norm[] = [], vs: Norm[] = [];
  segments.forEach((s, idx) => {
    if (segLen(s) < minLen) return;
    if (isH(s)) hs.push({ c: s.y1, a: Math.min(s.x1, s.x2), b: Math.max(s.x1, s.x2), idx });
    else if (isV(s)) vs.push({ c: s.x1, a: Math.min(s.y1, s.y2), b: Math.max(s.y1, s.y2), idx });
  });
  const keep = new Set<number>();
  markPaired(hs, wtMin, wtMax, minOverlap, keep);
  markPaired(vs, wtMin, wtMax, minOverlap, keep);
  const out: WallSegment[] = [];
  for (const idx of keep) { const s = segments[idx]; out.push({ x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, axis: isH(s) ? 'h' : 'v' }); }
  return out;
}
