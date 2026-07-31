// 伝法邸 Canonical Outline Case 回帰テスト（Phase D）。
//   実PDF(実住宅・L字/出窓/ポーチ)で初めて外形抽出が成立した例を fixture 固定し、
//   アルゴリズムを変えても 頂点数・面積・BBox・外形一致率(IoU) が崩れないことを守る。
//   ★fixture は Reader 抽出の軸平行線分のみ（顧客PDFは持ち込まない）。canonical 期待値も同梱。
import { wallFilter } from '../src/geometry/wallFilter';
import { traceOutline, type Pt } from '../src/geometry/contourTrace';
import type { VecSegment } from '../src/geometry/topology';
import fix from './fixtures/denbou-p3-axis.json';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };

const segs: VecSegment[] = (fix.segments as number[][]).map((a) => ({ x1: a[0], y1: a[1], x2: a[2], y2: a[3] }));
const cfg = fix.canonical;
const walls = wallFilter(segs, cfg.wallFilter);
const r = traceOutline(walls, cfg.contourTrace)!;

// ── 壁候補数（Noise Reduction が退行していないか）──
ok(Math.abs(walls.length - cfg.walls) <= 3, `壁候補 ${cfg.walls}±3（実 ${walls.length}）`);

// ── 外形が出る ──
ok(!!r && r.polygon.length >= 4, '外形ポリゴンが得られる');

// ── 頂点数（過剰=単純化退行 / 過少=形が潰れた を検知）──
ok(Math.abs(r.vertices - cfg.vertices) <= 6, `頂点数 ${cfg.vertices}±6（実 ${r.vertices}）`);

// ── 面積（±3%）──
ok(Math.abs(r.areaPx - cfg.areaPx) <= cfg.areaPx * 0.03, `面積 ${cfg.areaPx}±3%（実 ${Math.round(r.areaPx)}）`);

// ── BBox（各辺 ±cell*3）──
const tol = cfg.contourTrace.cell * 3;
ok(Math.abs(r.bbox.x0 - cfg.bbox.x0) <= tol && Math.abs(r.bbox.y0 - cfg.bbox.y0) <= tol
  && Math.abs(r.bbox.x1 - cfg.bbox.x1) <= tol && Math.abs(r.bbox.y1 - cfg.bbox.y1) <= tol,
  `BBox ≈ ${JSON.stringify(cfg.bbox)}（実 ${JSON.stringify(r.bbox)}）`);

// ── 外形一致率（IoU）：canonical polygon とラスタで重なりを測る ──
const ref: Pt[] = (cfg.polygon as number[][]).map((a) => ({ x: a[0], y: a[1] }));
const inPoly = (poly: Pt[], x: number, y: number): boolean => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};
const allX = [...ref, ...r.polygon].map((p) => p.x), allY = [...ref, ...r.polygon].map((p) => p.y);
const gx0 = Math.min(...allX), gx1 = Math.max(...allX), gy0 = Math.min(...allY), gy1 = Math.max(...allY);
const step = Math.max((gx1 - gx0), (gy1 - gy0)) / 220;
let inter = 0, uni = 0;
for (let y = gy0; y <= gy1; y += step) for (let x = gx0; x <= gx1; x += step) {
  const a = inPoly(ref, x, y), b = inPoly(r.polygon, x, y);
  if (a && b) inter++; if (a || b) uni++;
}
const iou = uni ? inter / uni : 0;
ok(iou >= 0.95, `外形一致率(IoU) ≥ 0.95（実 ${iou.toFixed(3)}）`);

if (fails.length) { console.error('❌ 伝法邸 Canonical FAIL:\n' + fails.map((f) => '  - ' + f).join('\n')); process.exit(1); }
console.log(`✅ 伝法邸 Canonical Outline test: 全 ${pass} 件合格（実PDF外形＝壁候補/頂点/面積/BBox/IoU${(iou).toFixed(3)} を回帰保護）`);
