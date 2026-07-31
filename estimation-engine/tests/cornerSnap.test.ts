// Corner Snap（Confirmation 支援）テスト。
//   ①単体：壁の端点＋H×V交点から角候補・クラスタで dedupe・snapToCorner の吸着/素通し。
//   ②伝法邸 Canonical：認識した壁（fixture）から作った角候補が、外形頂点をアンカーとして必ず保存し、
//     壁由来の角が外形頂点を実用しきい値内で被覆すること（＝「認識した壁の角へ吸着」が実データで成立）を回帰保護。
import { wallFilter, type WallSegment } from '../src/geometry/wallFilter';
import { traceOutline } from '../src/geometry/contourTrace';
import { wallCorners, snapToCorner, clusterPoints } from '../src/geometry/cornerSnap';
import type { VecSegment } from '../src/geometry/topology';
import fix from './fixtures/denbou-p3-axis.json';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };

// ── ① 単体 ─────────────────────────────────────────────
// L字外形（6角）。端点だけで6角が出る（過不足なし）。
const L: WallSegment[] = [
  { x1: 0, y1: 0, x2: 100, y2: 0, axis: 'h' }, { x1: 100, y1: 0, x2: 100, y2: 50, axis: 'v' },
  { x1: 100, y1: 50, x2: 50, y2: 50, axis: 'h' }, { x1: 50, y1: 50, x2: 50, y2: 100, axis: 'v' },
  { x1: 50, y1: 100, x2: 0, y2: 100, axis: 'h' }, { x1: 0, y1: 100, x2: 0, y2: 0, axis: 'v' },
];
ok(wallCorners(L, undefined, { cluster: 4 }).length === 6, `L字は6角（実 ${wallCorners(L, undefined, { cluster: 4 }).length}）`);

// H×V が端点を共有せず交わるケース：交点が角候補に出る。
const cross: WallSegment[] = [
  { x1: 0, y1: 50, x2: 100, y2: 50, axis: 'h' },
  { x1: 50, y1: 0, x2: 50, y2: 100, axis: 'v' },
];
const cc = wallCorners(cross, undefined, { cluster: 2 });
ok(cc.some((p) => Math.abs(p.x - 50) < 1 && Math.abs(p.y - 50) < 1), '十字の交点(50,50)が角候補に出る');

// クラスタ：完全重複は cluster=0 でも1点に。近接は cluster でまとまる。
ok(clusterPoints([{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 2 }], 0).length === 2, '完全重複は dedupe');
ok(clusterPoints([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 30, y: 0 }], 5).length === 2, '近接(≤5)はまとまり遠い点は残る');

// snapToCorner：しきい値内は完全一致・外は素通し。★アンカー（先頭）優先。
const corners = [{ x: 10, y: 10 }, { x: 40, y: 40 }];
const near = snapToCorner({ x: 12, y: 9 }, corners, 6);
ok(near.x === 10 && near.y === 10, 'しきい値内は角へ完全一致');
const far = snapToCorner({ x: 25, y: 25 }, corners, 6);
ok(far.x === 25 && far.y === 25, 'しきい値外は素通し（座標そのまま）');

// ── ② 伝法邸 Canonical 回帰 ──────────────────────────────
const segs: VecSegment[] = (fix.segments as number[][]).map((a) => ({ x1: a[0], y1: a[1], x2: a[2], y2: a[3] }));
const cfg: any = fix.canonical;
const walls = wallFilter(segs, cfg.wallFilter);
const fp = traceOutline(walls, cfg.contourTrace)!.polygon;
const CLUSTER = 12; // 外形頂点は最小24px間隔（出窓ノッチ）→ cluster<24 で全頂点を保存できる。

const withFp = wallCorners(walls, fp, { cluster: CLUSTER });
const wallsOnly = wallCorners(walls, undefined, { cluster: CLUSTER });

// 角候補が爆発しない（クラスタリングが効いている）。壁511本→端点/交点でも有界。
ok(withFp.length >= fp.length && withFp.length <= 400, `角候補は有界 ${fp.length}〜400（実 ${withFp.length}）`);

// 外形頂点（アンカー）は必ず保存される（クラスタで壁ノイズに飲まれない）。
let preserved = 0;
for (const v of fp) if (withFp.some((c) => c.x === v.x && c.y === v.y)) preserved++;
ok(preserved === fp.length, `外形頂点は全保存 ${fp.length}（実 ${preserved}）`);

// 壁だけから作った角が、外形頂点を実用しきい値内で被覆する（＝外形の角＝実在の壁角）。
//   許容 = ラスタ化(cell*dilate=6) + minStep スナップ(24) ≒ 28px。
const TOL = cfg.contourTrace.cell * cfg.contourTrace.dilate + cfg.contourTrace.minStep + 2; // 32
let covered = 0;
for (const v of fp) { let best = Infinity; for (const c of wallsOnly) { const d = Math.hypot(c.x - v.x, c.y - v.y); if (d < best) best = d; } if (best <= TOL) covered++; }
ok(covered >= fp.length - 3, `壁角が外形頂点を被覆 ≥${fp.length - 3}/${fp.length}（≤${TOL}px・実 ${covered}）`);

// 外形頂点付近をドラッグ→その頂点へ吸着（Confirmation の主操作）。
const v0 = fp[0];
const snapped = snapToCorner({ x: v0.x + 4, y: v0.y - 3 }, withFp, 10);
ok(snapped.x === v0.x && snapped.y === v0.y, `外形頂点付近は角へ吸着 (${v0.x},${v0.y})`);

if (fails.length) { console.error('❌ Corner Snap FAIL:\n' + fails.map((f) => '  - ' + f).join('\n')); process.exit(1); }
console.log(`✅ Corner Snap test: 全 ${pass} 件合格（端点/交点/クラスタ/吸着＋伝法邸で外形頂点を全保存・壁角で被覆）`);
