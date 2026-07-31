// Contour Tracer 自己テスト：壁線 → 建物外形ポリゴン（矩形/L字を追跡・矩形化・頂点数）。
import { traceOutline } from '../src/geometry/contourTrace';
import type { WallSegment } from '../src/geometry/wallFilter';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };
const seg = (x1: number, y1: number, x2: number, y2: number): WallSegment => ({ x1, y1, x2, y2, axis: Math.abs(y1 - y2) < 1e-3 ? 'h' : 'v' });
const near = (a: number, b: number, t = 3) => Math.abs(a - b) <= t;

// ── 1. 矩形（閉じた4辺）→ 4頂点・bbox一致（膨張は小さめに） ──
{
  const walls = [seg(0, 0, 100, 0), seg(100, 0, 100, 60), seg(100, 60, 0, 60), seg(0, 60, 0, 0)];
  const r = traceOutline(walls, { cell: 1, dilate: 1 });
  ok(!!r, '結果が返る');
  ok(r!.vertices === 4, `矩形→4頂点（実 ${r!.vertices}）`);
  ok(near(r!.bbox.x0, 0) && near(r!.bbox.y0, 0) && near(r!.bbox.x1, 100) && near(r!.bbox.y1, 60), `bbox≈(0,0)-(100,60)（実 ${JSON.stringify(r!.bbox)}）`);
  // 面積は膨張ぶん少し大きい。100*60=6000 以上・過大でない範囲。
  ok(r!.areaPx >= 6000 && r!.areaPx <= 6000 * 1.4, `面積≈6000（実 ${Math.round(r!.areaPx)}）`);
}

// ── 2. L字（6辺）→ 6頂点（凹み欠き込みを保持） ──
{
  const walls = [seg(0, 0, 100, 0), seg(100, 0, 100, 40), seg(100, 40, 40, 40), seg(40, 40, 40, 100), seg(40, 100, 0, 100), seg(0, 100, 0, 0)];
  const r = traceOutline(walls, { cell: 1, dilate: 1 });
  ok(!!r && r.vertices === 6, `L字→6頂点（実 ${r?.vertices}）`);
  // L字面積 = 100*100 - 60*60 = 10000-3600 = 6400（膨張ぶん増）
  ok(!!r && r.areaPx >= 6400 && r.areaPx <= 6400 * 1.4, `L字面積≈6400（実 ${Math.round(r?.areaPx ?? 0)}）`);
}

// ── 3. 部屋内の単線（footprintの穴埋め対象）があっても外形は矩形4頂点のまま ──
{
  const walls = [seg(0, 0, 120, 0), seg(120, 0, 120, 80), seg(120, 80, 0, 80), seg(0, 80, 0, 0), seg(60, 10, 60, 70)];
  const r = traceOutline(walls, { cell: 1, dilate: 1 });
  ok(!!r && r.vertices === 4, `内部の間仕切りは外形に影響しない→4頂点（実 ${r?.vertices}）`);
}

// ── 4. 空入力 → null（捏造しない） ──
{ ok(traceOutline([]) === null, '空→null'); }

if (fails.length) { console.error('❌ contourTrace FAIL:\n' + fails.map((f) => '  - ' + f).join('\n')); process.exit(1); }
console.log(`✅ contourTrace test: 全 ${pass} 件合格（矩形→4頂点・L字→6頂点・内部間仕切り無視・矩形化）`);
