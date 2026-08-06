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
import { edgeFaceCount, isSharedEdge, faceArea } from '../src/geometry/roofModel';
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
const polyAreaOf = (P: Pt[]) => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p.x * q.y - q.x * p.y; } return Math.abs(a / 2); };

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
const outlineArea = polyAreaOf(outline);
const planarSum = M.faces.reduce((s, f) => s + faceArea(M, f), 0);
const Vm = new Map(M.vertices.map((v) => [v.id, v] as const));
const noDiagonal = M.edges.every((e) => { const a = Vm.get(e.v[0])!, b = Vm.get(e.v[1])!; return Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6; });
const rcM = roleCounts(M);

// ★Ver1-1 受入基準：Resolver Outline を欠損・重複なく2面の共有辺グラフへ写像する。
//   固定＝面積保存/2面/共有棟辺1本/斜辺なし/ロール格納なし。更新＝頂点/辺数（bbox 6/7 → 外形なり）。
ok(outline.length === 26, `伝法邸 Outline 26頂点（実 ${outline.length}）`);
ok(M.faces.length === 2, `2面（実 ${M.faces.length}）`);
ok(Math.abs(planarSum - outlineArea) <= 1, `★面積保存：Σ面 planar = Outline（${Math.round(outlineArea)}px²・実 ${Math.round(planarSum)}）`);
ok([...edgeFaceCount(M).values()].filter((c) => c >= 2).length === 1, '共有棟辺はちょうど1本');
ok(noDiagonal, '斜辺なし（全辺 軸平行）');
ok(rcM.ridge === 1 && (rcM.eave ?? 0) > 0 && (rcM.gable ?? 0) > 0 && !rcM.valley && !rcM.hip, `棟1・軒/ケラバ創発・谷なし（Ver1-1）実 ${JSON.stringify(rcM)}`);
ok(roofType(M) === 'gable', '伝法邸：roofType=gable（創発・格納しない）');
ok(M.faces.every((f) => !!faceDownhill(M, f)) && eaveIsOuter(M), '各面が外側の軒を指す（bbox より外形忠実）');
ok(M.vertices.length === 27 && M.edges.length === 29, `外形なり：頂点27・辺29（bbox の6/7 から更新・実 ${M.vertices.length}/${M.edges.length}）`);
ok(M.edges.every((e) => e.roleOverride == null), '伝法邸：F-3 は辺ロールを格納しない（創発）');
// ★実機回帰：placeFootprint 相当の非整数スケール+オフセット後でも「棟が中央に1本」創発する（丸めで辺が潰れても棟が消えない）。
const scaledOutline = outline.map((p) => ({ x: p.x * 0.7137 + 13.2, y: p.y * 0.7137 + 9.8 }));
const Ms = generateRoofFaces(scaledOutline, undefined, { scale: 1 });
const rcS = roleCounts(Ms);
ok(Ms.faces.length === 2 && rcS.ridge === 1 && !rcS.valley && !rcS.hip, `実機回帰：非整数配置でも 2面・棟1本・谷なし（実 faces ${Ms.faces.length} ${JSON.stringify(rcS)}）`);

if (fails.length) { console.error('❌ Roof Face Generator FAIL:\n' + fails.map((f) => '  - ' + f).join('\n')); process.exit(1); }
console.log(`✅ Roof Face Generator (F-3 Ver1-1) test: 全 ${pass} 件合格（矩形は Ver0 と一致・伝法邸は外形なり2面へ写像＝面積保存/棟辺1本/斜辺なし・谷は作らない）`);
