// 甍AI Contour Tracer — 壁候補（ノイズ除去後）から「建物外周候補（Building Footprint Candidate）」を追跡で得る段。
//   ★出力は建物・付属形状の外周候補であって「屋根外形」ではない（壁外周≠屋根外周：軒の出/バルコニー/庇/下屋/セットバック）。
//     屋根外形は後段の Roof Analyzer が解釈し、人が確認する（OUTLINE-RECOGNITION.md O#10）。
//   ★総当たり矩形探索（compileTopology・棄却=O#1）ではなく輪郭追跡。L字/コの字/出っ張りに対応・O(grid)。
//   ★純関数・UI/pdfjs/canvas 非依存。正の設計：claude/OUTLINE-RECOGNITION.md（O#5）。
//
//   手順：ラスタ化 → 膨張(開口を閉じる) → 連結成分(最大=建物の壁ネットワーク) → 穴埋め(部屋)
//        → セル辺の境界追跡（矩形ポリゴン）→ 共線点の単純化 → PDF 座標へ。
//   ※Wall Filter が通り芯・寸法線・シート枠を落としているので、最大連結成分＝建物になる。

import type { WallSegment } from './wallFilter';

export interface Pt { x: number; y: number }
export interface ContourOptions {
  cell?: number;    // ラスタのセル幅(PDF単位)。既定2。
  dilate?: number;  // 開口(ドア等)を閉じる膨張(セル数)。既定3。
  maxCells?: number; // グリッド上限（安全弁）。既定4,000,000。超えたら cell を自動で粗く。
  minStep?: number;  // 単純化：この寸法(PDF単位)未満の段差はマージ（出窓等の細かい凹凸を落とす）。既定 cell*6。0で無効。
}

// 共線マージ：連続3点が同一x/同一yなら中点を除去。
function mergeCollinear(poly: Pt[]): Pt[] {
  const n = poly.length; if (n < 3) return poly.slice();
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[(i - 1 + n) % n], b = poly[i], c = poly[(i + 1) % n];
    if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) continue;
    out.push(b);
  }
  return out.length ? out : poly.slice();
}
// 矩形化ポリゴンの単純化：グリッドスナップ（軸平行を保ったまま微小段差＝出窓等を潰す）→ 連続重複除去 → 共線マージ。
//   ★Douglas-Peucker は斜め辺を作るため矩形footprintには使わない。スナップは軸平行を保存し、min未満の凹凸だけ消える。
export function simplifyRectilinear(poly: Pt[], minStep: number): Pt[] {
  if (minStep <= 0 || poly.length < 4) return mergeCollinear(poly);
  const snap = (v: number) => Math.round(v / minStep) * minStep;
  const s = poly.map((p) => ({ x: snap(p.x), y: snap(p.y) }));
  const dedup: Pt[] = [];
  for (const p of s) { const last = dedup[dedup.length - 1]; if (!last || last.x !== p.x || last.y !== p.y) dedup.push(p); }
  if (dedup.length > 1) { const f = dedup[0], l = dedup[dedup.length - 1]; if (f.x === l.x && f.y === l.y) dedup.pop(); }
  return mergeCollinear(dedup);
}
export interface ContourResult {
  polygon: Pt[];                 // 建物外形（矩形化・PDF座標・閉路。first≠last）
  areaPx: number;                // ポリゴン面積(PDF単位^2・|shoelace|)
  bbox: { x0: number; y0: number; x1: number; y1: number };
  vertices: number;              // ポリゴン頂点数
  grid: { w: number; h: number; cell: number };
  cellsBuilding: number;         // 建物成分のセル数（footprint 塗り後）
}

const EPS = 1e-3;

export function traceOutline(walls: WallSegment[], opt: ContourOptions = {}): ContourResult | null {
  if (!walls.length) return null;
  let cell = opt.cell ?? 2; const dilate = opt.dilate ?? 3; const maxCells = opt.maxCells ?? 4_000_000;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of walls) { x0 = Math.min(x0, s.x1, s.x2); y0 = Math.min(y0, s.y1, s.y2); x1 = Math.max(x1, s.x1, s.x2); y1 = Math.max(y1, s.y1, s.y2); }
  const pad = dilate + 2;
  // グリッドが大きすぎる場合は cell を粗くする（安全弁）。
  const gcells = () => (Math.ceil((x1 - x0) / cell) + pad * 2) * (Math.ceil((y1 - y0) / cell) + pad * 2);
  while (gcells() > maxCells) cell *= 1.5;
  const W = Math.ceil((x1 - x0) / cell) + pad * 2, H = Math.ceil((y1 - y0) / cell) + pad * 2;
  const gx = (x: number) => Math.round((x - x0) / cell) + pad, gy = (y: number) => Math.round((y - y0) / cell) + pad;

  // 1) ラスタ化
  const occ = new Uint8Array(W * H);
  for (const s of walls) {
    const ax0 = gx(Math.min(s.x1, s.x2)), ax1 = gx(Math.max(s.x1, s.x2)), ay0 = gy(Math.min(s.y1, s.y2)), ay1 = gy(Math.max(s.y1, s.y2));
    if (Math.abs(s.y1 - s.y2) < EPS) { for (let x = ax0; x <= ax1; x++) occ[ay0 * W + x] = 1; }
    else { for (let y = ay0; y <= ay1; y++) occ[y * W + ax0] = 1; }
  }
  // 2) 膨張（開口を閉じる）。★8近傍(正方形)＝角を直角に保つ（4近傍だと角が斜めに欠けて余分な頂点が出る）。
  let cur = occ;
  for (let r = 0; r < dilate; r++) {
    const nx = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (cur[y * W + x]) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && X < W && Y >= 0 && Y < H) nx[Y * W + X] = 1; }
    }
    cur = nx;
  }
  const occD = cur;
  // 3) 連結成分（8近傍）→ 最大セル数＝建物の壁ネットワーク
  const lab = new Int32Array(W * H).fill(-1); const count = new Map<number, number>(); let id = 0;
  for (let s = 0; s < W * H; s++) if (occD[s] && lab[s] < 0) {
    const q = [s]; lab[s] = id; let n = 0;
    while (q.length) { const i = q.pop()!; n++; const x = i % W, y = (i / W) | 0;
      const nb = [x < W - 1 ? i + 1 : -1, x > 0 ? i - 1 : -1, y < H - 1 ? i + W : -1, y > 0 ? i - W : -1, (x < W - 1 && y < H - 1) ? i + W + 1 : -1, (x > 0 && y > 0) ? i - W - 1 : -1, (x < W - 1 && y > 0) ? i - W + 1 : -1, (x > 0 && y < H - 1) ? i + W - 1 : -1];
      for (const j of nb) if (j >= 0 && occD[j] && lab[j] < 0) { lab[j] = id; q.push(j); } }
    count.set(id, n); id++;
  }
  if (!count.size) return null;
  let bestId = -1, bestN = 0; for (const [k, n] of count) if (n > bestN) { bestN = n; bestId = k; }
  const wallBlob = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) wallBlob[i] = lab[i] === bestId ? 1 : 0;
  // 4) 穴埋め（部屋）：外側 floodfill → 未到達の空セル＝内部
  const outside = new Uint8Array(W * H); const st: number[] = [];
  for (let x = 0; x < W; x++) { st.push(x, 0, x, H - 1); } for (let y = 0; y < H; y++) { st.push(0, y, W - 1, y); }
  while (st.length) { const y = st.pop()!, x = st.pop()!; if (x < 0 || x >= W || y < 0 || y >= H) continue; const i = y * W + x; if (outside[i] || wallBlob[i]) continue; outside[i] = 1; st.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1); }
  const fp = new Uint8Array(W * H); let fpCells = 0;
  for (let i = 0; i < W * H; i++) { fp[i] = (wallBlob[i] || !outside[i]) ? 1 : 0; if (fp[i]) fpCells++; }
  const isFp = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H && fp[y * W + x] === 1;

  // 5) セル辺の境界追跡（時計回り・内部を右に）。有向境界辺を集め、端点で連結して最長ループを取る。
  //    セル(cx,cy)＝角(cx,cy)〜(cx+1,cy+1)。上=y小。
  const key = (x: number, y: number) => x * 100003 + y;
  const outMap = new Map<number, { x: number; y: number }>(); // 始点→終点（有向辺）
  const addEdge = (ax: number, ay: number, bx: number, by: number) => { outMap.set(key(ax, ay), { x: bx, y: by }); };
  for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) if (fp[cy * W + cx]) {
    if (!isFp(cx, cy - 1)) addEdge(cx, cy, cx + 1, cy);         // 上辺：→（右向き）
    if (!isFp(cx + 1, cy)) addEdge(cx + 1, cy, cx + 1, cy + 1); // 右辺：↓
    if (!isFp(cx, cy + 1)) addEdge(cx + 1, cy + 1, cx, cy + 1); // 下辺：←
    if (!isFp(cx - 1, cy)) addEdge(cx, cy + 1, cx, cy);         // 左辺：↑
  }
  if (!outMap.size) return null;
  // 最長ループを1本たどる（外形）。開始＝最小(y,x)の角。
  let start = -1, sy = Infinity, sx = Infinity;
  for (const k of outMap.keys()) { const x = Math.floor(k / 100003), y = k % 100003; if (y < sy || (y === sy && x < sx)) { sy = y; sx = x; start = k; } }
  const loop: Pt[] = []; let ck = start; const guard = outMap.size + 4; let steps = 0;
  do {
    const x = Math.floor(ck / 100003), y = ck % 100003; loop.push({ x, y });
    const nx = outMap.get(ck); if (!nx) break; ck = key(nx.x, nx.y);
    if (++steps > guard) break;
  } while (ck !== start);

  // 6) 共線点の単純化（矩形ポリゴン化：連続3点が同一 x または 同一 y の中点を除去）
  const simp: Pt[] = [];
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const a = loop[(i - 1 + n) % n], b = loop[i], c = loop[(i + 1) % n];
    const collinear = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
    if (!collinear) simp.push(b);
  }
  // 7) グリッド角 → PDF 座標 → 単純化（微小段差マージ・軸平行保存）
  const toPdf = (p: Pt): Pt => ({ x: (p.x - pad) * cell + x0, y: (p.y - pad) * cell + y0 });
  const minStep = opt.minStep ?? cell * 6;
  const poly = simplifyRectilinear(simp.map(toPdf), minStep);
  // shoelace 面積・bbox
  let area2 = 0, bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; area2 += p.x * q.y - q.x * p.y; bx0 = Math.min(bx0, p.x); by0 = Math.min(by0, p.y); bx1 = Math.max(bx1, p.x); by1 = Math.max(by1, p.y); }
  return { polygon: poly, areaPx: Math.abs(area2) / 2, bbox: { x0: bx0, y0: by0, x1: bx1, y1: by1 }, vertices: poly.length, grid: { w: W, h: H, cell }, cellsBuilding: fpCells };
}
