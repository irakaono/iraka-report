// Phase F / F-3 Roof Face Generator（Ver0）テスト。
//   ★受入基準（§8.2）：屋根タイプを当てることではなく、「各 Face が正しい軒辺を指し、共有辺グラフ上で
//     roofEngine.edgeRole() が ridge/eave/gable を創発できる」こと。
//   ①単体：矩形（横長/縦長）→ 切妻2面・各面が外側軒を指す・roleCounts{ridge:1,eave:2,gable:4}・roofType gable。
//          pickPitch（ElevationSpec 最頻値／空→fallback）。
//   ②規律：F-3 は新IRを作らず既存 RoofModel を返す・面は boundary(辺ID列)で polygon を持たない・
//          EdgeRole を格納しない（roleOverride 全 undefined＝創発）・各面 slope.downhill.toEdgeId が設定される。
//   ③伝法邸 Canonical：Facts→Candidate→Resolver→F-3 の一本を通し、辺ロールが創発することを固定。
import { generateRoofFaces, pickPitch } from '../src/geometry/roofFaces';
import { roleCounts, roofType, faceDownhill } from '../src/geometry/roofEngine';
import { edgeFaceCount, isSharedEdge } from '../src/geometry/roofModel';
import { geometryFeatures } from '../src/geometry/footprintFeatures';
import { analyzeRoof } from '../src/geometry/roofAnalyzer';
import { resolveRoofOutline } from '../src/geometry/roofResolver';
import { wallFilter } from '../src/geometry/wallFilter';
import { traceOutline } from '../src/geometry/contourTrace';
import type { Pt } from '../src/geometry/contourTrace';
import type { VecSegment } from '../src/geometry/topology';
import type { ElevationSpec } from '../src/geometry/recognizer';
import fix from './fixtures/denbou-p3-axis.json';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };
const mk = (p: number[][]): Pt[] => p.map((a) => ({ x: a[0], y: a[1] }));
const eq = (got: Record<string, number>, exp: Record<string, number>) =>
  JSON.stringify(Object.fromEntries(Object.entries(got).sort())) ===
  JSON.stringify(Object.fromEntries(Object.entries(exp).sort()));
const GABLE = { ridge: 1, eave: 2, gable: 4 };

// 各 Face の軒（downhill.toEdgeId）が「外周辺（面1枚が使う辺）」を指しているか＝正しく軒を指している。
const eaveIsOuter = (m: ReturnType<typeof generateRoofFaces>) =>
  m.faces.every((f) => {
    const dh = f.slope.downhill;
    if (!dh || !('toEdgeId' in dh)) return false;
    return (edgeFaceCount(m).get(dh.toEdgeId) ?? 0) === 1; // 軒は境界辺（共有辺＝棟ではない）
  });

// ── ① 単体：矩形 → 切妻（役割は創発） ──────────────────────
// 横長（ridge 水平）。
const land = generateRoofFaces(mk([[0, 0], [400, 0], [400, 240], [0, 240]]), undefined, { scale: 50 });
ok(land.faces.length === 2, '横長矩形→2面');
ok(eq(roleCounts(land), GABLE), `横長→ridge1/eave2/gable4 が創発（実 ${JSON.stringify(roleCounts(land))}）`);
ok(roofType(land) === 'gable', '横長→roofType=gable（創発）');
ok([...edgeFaceCount(land).values()].filter((c) => c === 2).length === 1, '共有辺（棟）はちょうど1本');
ok(land.faces.every((f) => !!faceDownhill(land, f)) && eaveIsOuter(land), '各面が外側の軒を指す');

// 縦長（ridge 垂直）。向きが変わっても同じ役割が創発する。
const port = generateRoofFaces(mk([[0, 0], [240, 0], [240, 400], [0, 400]]), undefined, { scale: 50 });
ok(port.faces.length === 2 && eq(roleCounts(port), GABLE) && roofType(port) === 'gable', '縦長→2面・ridge1/eave2/gable4・gable');
ok(port.faces.every((f) => !!faceDownhill(port, f)) && eaveIsOuter(port), '縦長でも各面が外側の軒を指す');

// pickPitch：ElevationSpec の最頻値／空→fallback。
const elev: ElevationSpec[] = [
  { dir: 'east', pitches: [2, 4, 4], overhangs: [], labels: [] },
  { dir: 'west', pitches: [4], overhangs: [], labels: [] },
];
ok(pickPitch(elev) === 4, 'pickPitch＝最頻値4（[2,4,4]+[4]）');
ok(pickPitch(undefined) === 5 && pickPitch([]) === 5, 'pickPitch＝空なら fallback 5');
// elevation を渡すと pitch が反映される（明示 opts.pitch 省略時）。
const withElev = generateRoofFaces(mk([[0, 0], [400, 0], [400, 240], [0, 240]]), elev);
ok(withElev.faces.every((f) => f.slope.pitch === 4), 'elevation→単一pitch4 が全面へ');

// ── ② 規律：新IRを作らない・polygon を持たない・ロールを格納しない ──
ok('vertices' in land && 'edges' in land && 'faces' in land && land.schemaVersion === 1, 'F-3 出力は既存 RoofModel（新IRではない）');
ok(land.faces.every((f) => Array.isArray(f.boundary) && f.boundary.every((id) => typeof id === 'string')), '面は boundary(辺ID列)で持つ（polygon を面に持たない）');
ok(land.faces.every((f) => !('polygon' in (f as any)) && !('vertices' in (f as any))), '面に polygon/vertices フィールドは無い');
ok(land.edges.every((e) => e.roleOverride == null), 'EdgeRole を格納しない（roleOverride 全 undefined＝roofEngine が創発）');
ok(land.faces.every((f) => f.slope.downhill && 'toEdgeId' in f.slope.downhill), '各面 slope.downhill.toEdgeId が設定される（軒を指す）');

// ── ③ 伝法邸 Canonical：Facts→Candidate→Resolver→F-3 一本 ──
const segs: VecSegment[] = (fix.segments as number[][]).map((a) => ({ x1: a[0], y1: a[1], x2: a[2], y2: a[3] }));
const cfg: any = fix.canonical;
const F = geometryFeatures(traceOutline(wallFilter(segs, cfg.wallFilter), cfg.contourTrace)!.polygon);
const outline = resolveRoofOutline(F, analyzeRoof(F)).polygon; // Resolver 確定外形（26頂点）
const M = generateRoofFaces(outline, undefined, { scale: 1, name: '伝法邸' });

ok(outline.length === 26 && M.faces.length === 2, `伝法邸：外形26頂点→2面（実 ${outline.length}→${M.faces.length}）`);
ok(M.vertices.length === 6 && M.edges.length === 7, `dedup：頂点6・辺7（実 ${M.vertices.length}/${M.edges.length}）`);
// ★受入基準：各面が正しく軒を指し、共有辺グラフ上で役割が創発する。
ok(eq(roleCounts(M), GABLE), `伝法邸：ridge1/eave2/gable4 が創発（実 ${JSON.stringify(roleCounts(M))}）`);
ok(roofType(M) === 'gable', '伝法邸：roofType=gable（創発・格納しない）');
ok(M.faces.every((f) => !!faceDownhill(M, f)) && eaveIsOuter(M), '伝法邸：各面が外側の軒を指す');
ok([...edgeFaceCount(M).values()].filter((c) => c === 2).length === 1, '伝法邸：共有辺（棟）はちょうど1本');
ok(M.edges.every((e) => e.roleOverride == null), '伝法邸：F-3 は辺ロールを格納しない（創発）');

if (fails.length) { console.error('❌ Roof Face Generator FAIL:\n' + fails.map((f) => '  - ' + f).join('\n')); process.exit(1); }
console.log(`✅ Roof Face Generator (F-3 Ver0) test: 全 ${pass} 件合格（外形→切妻2面・各面が軒を指す・ridge1/eave2/gable4 と gable が創発・ロールは格納しない＋伝法邸で一本通し）`);
