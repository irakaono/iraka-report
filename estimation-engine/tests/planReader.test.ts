// Plan Reader 自己テスト：Vector Reader（線分）→ Geometry Reader（閉領域/外周/壁取り合い）
//   → Plan Analyzer（RoofUnit候補）→ Reconciler（立面を器へ集約）。★Reader は推論しない。
import { readGeometry, type VecSegment } from '../src/geometry/planReader';
import { analyzePlan, reconcileRoofConfig, type ElevationSpec } from '../src/geometry/recognizer';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };
const seg = (x1: number, y1: number, x2: number, y2: number): VecSegment => ({ x1, y1, x2, y2 });

// 平面：主屋根(0,0)-(100,80) ＋ 東下屋(100,20)-(160,70)（x=100 の壁で取り合う）。
const rect = (x0: number, y0: number, x1: number, y1: number) => [
  seg(x0, y0, x1, y0), seg(x0, y1, x1, y1), seg(x0, y0, x0, y1), seg(x1, y0, x1, y1),
];
const segments: VecSegment[] = [...rect(0, 0, 100, 80), ...rect(100, 20, 160, 70)];

// ── Geometry Reader：線分 → 純トポロジ（loops/adjacency/containment）。★屋根も方位も知らない。 ──
const geo = readGeometry(segments);
ok(geo.loops.length === 2, `閉ループ2つ（実 ${geo.loops.length}）`);
const big = geo.loops.slice().sort((a, b) => b.area - a.area)[0];
const small = geo.loops.slice().sort((a, b) => b.area - a.area)[1];
ok(big.area === 8000 && small.area === 3000, `面積 主8000/下屋3000（実 ${big.area}/${small.area}）`);
ok(geo.adjacency.length === 1, '隣接1組（主屋根と下屋が辺を共有）');
const adj = geo.adjacency[0];
ok((adj.a === big.id && adj.aSide === 'right' && adj.bSide === 'left') || (adj.a === small.id && adj.aSide === 'left' && adj.bSide === 'right'),
  `共有辺の Side（主=right/下屋=left）（実 ${JSON.stringify(adj)}）`);
ok(geo.containment.length === 0, '内包なし（並置）');
ok(geo.bbox.x0 === 0 && geo.bbox.x1 === 160 && geo.bbox.y0 === 0 && geo.bbox.y1 === 80, '全体外接 bbox');
// ★Geometry Reader は屋根・方位・壁取り合いを持たない（純トポロジ）。
ok(!('facing' in (big as object)) && !('wallSides' in (big as object)), 'Loop は方位/壁取り合いを持たない（意味は Analyzer）');

// ── Plan Analyzer：トポロジ → RoofUnit候補（最大＝主屋根/壁なし、他＝下屋/壁取り合いで雨押え） ──
const analysis = analyzePlan(geo, { northDeg: 0 });
ok(analysis.units[0].role === 'main' && analysis.units[0].wallAdjacent === false, '主屋根候補＝壁なし（片棟＝つかみ込み）');
ok(analysis.units[1].role === 'lower' && analysis.units[1].wallAdjacent === true && analysis.units[1].name === '東下屋', '下屋候補＝東下屋・壁取り合い（雨押え）');

// ── 四段通し：立面 Observation（主屋根=西4寸・下屋=東2寸/軒600）を器へ集約 → 確定 ──
const elevations: ElevationSpec[] = [
  { dir: 'west', pitches: [4], overhangs: [], labels: [] },
  { dir: 'east', pitches: [2], overhangs: [600], labels: [] },
];
const cfg = reconcileRoofConfig({ plan: analysis, elevations });
ok(cfg.roofs.length === 2, '四段通し→系統2');
const m = cfg.roofs[0], d = cfg.roofs[1];
ok(m.role === 'main' && m.slope === 4, '主屋根＝西4寸');
// ★主屋根の水上は「片流れの水下がどの辺か」＝Shape 次第。平面の外周(多方向)だけでは決められない＝捏造しない。
ok(!(m.edges || []).some((e) => e.role === 'grip' || e.role === 'flashing'), '主屋根の水上は多方向のため未確定（Shape確定へ委ねる）');
// 下屋は壁の反対＝軒が一意（東）。水下=軒600、水上=雨押え まで確定できる。
ok(d.role === 'lower' && d.slope === 2 && (d.edges || []).some((e) => e.role === 'flashing')
  && (d.edges || []).some((e) => e.role === 'eave' && e.dir === 'east' && e.overhang === 600), '東下屋＝2寸・軒600・雨押え');

// 線分が無ければループ無し（Reader は捏造しない）。
ok(readGeometry([]).loops.length === 0, '線分なし→ループなし（捏造しない）');

if (fails.length) { console.error('❌ planReader FAIL:\n' + fails.map((f) => '  - ' + f).join('\n')); process.exit(1); }
console.log(`✅ planReader test: 全 ${pass} 件合格（Vector→Geometry→Plan Analyzer→Reconciler の四段通し）`);
