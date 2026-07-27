// 立面図からの推論（AIは提案・人が確認＝原則14）。縮尺(scaleInference)と同じ思想。
//   ① 勾配（寸）：「N寸」「N/10」表記、または勾配三角の「10」と隣接する上り数字(rise)から拾う。
//   ② 軒の出（mm）：「軒先/軒の出/樋先」ラベル近傍の寸法から拾う。
//   いずれも候補列挙＋最頻値。土台になる値なので、確定は人（勾配・軒の出は数量に効く）。

export interface ElevTextItem { str: string; x: number; y: number }

function toNum(s: string): number | null {
  const t = s.trim();
  if (!/^-?\d{1,4}(?:,\d{3})*(?:\.\d+)?$|^-?\d+(?:\.\d+)?$/.test(t)) return null;
  const v = Number(t.replace(/,/g, ''));
  return isFinite(v) ? v : null;
}
function mode(nums: number[]): number | undefined {
  if (!nums.length) return undefined;
  const f = new Map<number, number>();
  nums.forEach((n) => f.set(n, (f.get(n) ?? 0) + 1));
  return [...f.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

// 勾配候補（寸＝10に対する上り）。0.5〜12寸を妥当範囲とする。
export function pitchCandidates(items: ElevTextItem[]): number[] {
  const out: number[] = [];
  const joined = items.map((i) => i.str).join('\n');
  // 明示表記：N寸 / N/10 / 10/N
  let m: RegExpExecArray | null;
  const reSun = /(\d+(?:\.\d+)?)\s*寸/g;
  while ((m = reSun.exec(joined))) { const v = Number(m[1]); if (v >= 0.5 && v <= 12) out.push(v); }
  const reSlash = /(\d+(?:\.\d+)?)\s*[/／]\s*10(?![\d])|(?<![\d])10\s*[/／]\s*(\d+(?:\.\d+)?)/g;
  while ((m = reSlash.exec(joined))) { const v = Number(m[1] ?? m[2]); if (v >= 0.5 && v <= 12) out.push(v); }
  // 勾配三角：「10」トークンの近傍(≤50pt)にある 0.5〜12 の数字を上り(rise)として拾う（N寸表記が無い図面用）。
  const tens = items.filter((i) => i.str.trim() === '10');
  for (const t of tens) {
    let best: { v: number; d: number } | null = null;
    for (const it of items) {
      if (it === t) continue;
      const v = toNum(it.str); if (v == null || v === 10 || v < 0.5 || v > 12) continue;
      const d = Math.hypot(it.x - t.x, it.y - t.y);
      if (d <= 50 && (!best || d < best.d)) best = { v, d };
    }
    if (best) out.push(best.v);
  }
  return out;
}

// 軒の出候補（mm）。「軒先/軒の出/軒出/樋先」ラベル近傍(≤80pt)の 150〜900mm を拾う。
export function overhangCandidates(items: ElevTextItem[]): number[] {
  const labels = items.filter((i) => /軒先|軒の出|軒出|樋先/.test(i.str));
  const out: number[] = [];
  for (const lb of labels) {
    for (const it of items) {
      const v = toNum(it.str); if (v == null || v < 150 || v > 900) continue;
      const d = Math.hypot(it.x - lb.x, it.y - lb.y);
      if (d <= 80) out.push(v);
    }
  }
  return out;
}

export interface ElevationHint {
  pitch?: number; pitchCandidates: number[];
  overhang?: number; overhangCandidates: number[];
}
export function inferElevation(items: ElevTextItem[]): ElevationHint {
  const pc = pitchCandidates(items);
  const oc = overhangCandidates(items);
  const uniq = (a: number[]) => Array.from(new Set(a)).sort((x, y) => x - y);
  return { pitch: mode(pc), pitchCandidates: uniq(pc), overhang: mode(oc), overhangCandidates: uniq(oc) };
}

// ── 軒の出オフセット：壁の外周ポリゴンを外側へ d(px) 広げる（凸/矩形向けのマイター）。 ──
export interface Pt { x: number; y: number }
export function offsetPolygonOutward(points: Pt[], d: number): Pt[] {
  const n = points.length;
  if (n < 3 || d === 0) return points.map((p) => ({ ...p }));
  // 面積の符号で回り向きを判定し、外向き法線を決める。
  let area2 = 0;
  for (let i = 0; i < n; i++) { const a = points[i], b = points[(i + 1) % n]; area2 += a.x * b.y - b.x * a.y; }
  const ccw = area2 > 0; // 画面座標(y下向き)では符号の意味が反転するが、外向きは centroid で最終確認する
  const cx = points.reduce((s, p) => s + p.x, 0) / n, cy = points.reduce((s, p) => s + p.y, 0) / n;
  // 各辺を外向き法線方向へ d 平行移動 → 隣接辺の交点を新頂点に。
  const lines = points.map((p, i) => {
    const q = points[(i + 1) % n];
    let nx = q.y - p.y, ny = -(q.x - p.x); // 法線候補
    const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
    // 外向き（辺中点から centroid と逆）に合わせる
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    if ((mx - cx) * nx + (my - cy) * ny < 0) { nx = -nx; ny = -ny; }
    void ccw;
    return { px: p.x + nx * d, py: p.y + ny * d, dx: q.x - p.x, dy: q.y - p.y };
  });
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const L2 = lines[i];                 // 頂点 i は 辺(i-1) と 辺(i) の交点
    const L1 = lines[(i - 1 + n) % n];
    const ix = intersect(L1.px, L1.py, L1.dx, L1.dy, L2.px, L2.py, L2.dx, L2.dy);
    out.push(ix ?? { x: points[i].x, y: points[i].y });
  }
  return out;
}
function intersect(px: number, py: number, dx: number, dy: number, qx: number, qy: number, ex: number, ey: number): Pt | null {
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-6) return null; // 平行
  const t = ((qx - px) * ey - (qy - py) * ex) / den;
  return { x: px + dx * t, y: py + dy * t };
}
