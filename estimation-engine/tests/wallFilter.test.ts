// Noise Reduction（二重線 Wall Filter）自己テスト：壁厚ペアだけ残し、単線/通り芯/短線を落とす。
import { wallFilter, type WallSegment } from '../src/geometry/wallFilter';
import type { VecSegment } from '../src/geometry/topology';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };
const h = (y: number, x1: number, x2: number): VecSegment => ({ x1, y1: y, x2, y2: y });
const v = (x: number, y1: number, y2: number): VecSegment => ({ x1: x, y1, x2: x, y2 });
const hasSeg = (w: WallSegment[], s: VecSegment) => w.some((k) => k.x1 === s.x1 && k.y1 === s.y1 && k.x2 === s.x2 && k.y2 === s.y2);

// ── 1. 二重線（壁厚6・オーバーラップ十分）は両方 keep ──
{
  const segs = [h(0, 0, 100), h(6, 0, 100)];
  const w = wallFilter(segs);
  ok(w.length === 2 && hasSeg(w, segs[0]) && hasSeg(w, segs[1]), `二重線ペア→両方keep（実 ${w.length}）`);
  ok(w.every((k) => k.axis === 'h'), 'axis=h が付く');
}

// ── 2. 単線（ペアなし）は落ちる＝寸法線・引き出し線の除去 ──
{
  const w = wallFilter([h(0, 0, 100)]);
  ok(w.length === 0, `単線は非壁（実 ${w.length}）`);
}

// ── 3. 通り芯（間隔が広い＝壁厚超）は落ちる ──
{
  const w = wallFilter([h(0, 0, 100), h(43, 0, 100)], { wtMax: 12 }); // 910mm≈43pt
  ok(w.length === 0, `通り芯間隔(43)は非壁（実 ${w.length}）`);
}

// ── 4. 壁厚内でも投影が重ならなければ非壁（偶然の平行を排除） ──
{
  const w = wallFilter([h(0, 0, 40), h(6, 100, 200)]); // x範囲が離れて重ならない
  ok(w.length === 0, `平行でも非オーバーラップは非壁（実 ${w.length}）`);
}

// ── 5. 短い線（minLen未満）は端から除外（文字・目盛のヒゲ） ──
{
  const w = wallFilter([h(0, 0, 4), h(6, 0, 4)], { minLen: 6 });
  ok(w.length === 0, `短線は除外（実 ${w.length}）`);
}

// ── 6. 縦の二重線も検出（axis=v） ──
{
  const segs = [v(0, 0, 80), v(7, 0, 80)];
  const w = wallFilter(segs, { wtMax: 12 });
  ok(w.length === 2 && w.every((k) => k.axis === 'v'), `縦の二重線→両方keep・axis=v（実 ${w.length}）`);
}

// ── 7. 矩形の二重壁（外周＋内周）は8辺すべて keep、内部の単線家具は落ちる ──
{
  const outer = [h(0, 0, 100), h(60, 0, 100), v(0, 0, 60), v(100, 0, 60)];
  const inner = [h(6, 6, 94), h(54, 6, 94), v(6, 6, 54), v(94, 6, 54)]; // 壁厚6の内側
  const furniture = [h(30, 20, 40)]; // 部屋内の単線
  const w = wallFilter([...outer, ...inner, ...furniture]);
  ok(w.length === 8, `二重壁の矩形→8辺keep・家具単線は除外（実 ${w.length}）`);
  ok(!hasSeg(w, furniture[0]), '家具の単線は落ちる');
}

// ── 8. 空入力→空（捏造しない） ──
{ ok(wallFilter([]).length === 0, '空→空'); }

if (fails.length) { console.error('❌ wallFilter FAIL:\n' + fails.map((f) => '  - ' + f).join('\n')); process.exit(1); }
console.log(`✅ wallFilter(Noise Reduction) test: 全 ${pass} 件合格（二重線ペア検出／単線・通り芯・短線・家具の除去）`);
