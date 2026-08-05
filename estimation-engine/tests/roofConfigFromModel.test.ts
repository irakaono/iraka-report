// Phase F / F-4 Roof Configuration（Ver0）テスト。
//   ★責務（§8.3・責務反転）：Configuration の生成源は Geometry（RoofModel）。Observation は補正 Evidence だけ。
//   ①切妻/片流れ/寄棟 RoofModel → shape・slope・edges を Geometry から写像（roofType/pitch/edgeRole が源）。
//   ②★規律：slope は Geometry から（model pitch=5・elevation pitch=[2] でも slope=5＝Observation で上書きしない）。
//          overhang は Observation の補正で eave に付く。
//   ③既存 LOCK を壊さない：出力は既存 RoofConfiguration 契約（buildRoofConfiguration・ConfigEdgeRole）。
//   ④伝法邸 Canonical：Facts→Candidate→Resolver→F-3→F-4 の一本を通す。
import { configFromRoofModel } from '../src/geometry/roofConfigFromModel';
import { generateRoofFaces } from '../src/geometry/roofFaces';
import { buildRoofModelFromFaces } from '../src/geometry/roofModel';
import { geometryFeatures } from '../src/geometry/footprintFeatures';
import { analyzeRoof } from '../src/geometry/roofAnalyzer';
import { resolveRoofOutline } from '../src/geometry/roofResolver';
import { wallFilter } from '../src/geometry/wallFilter';
import { traceOutline } from '../src/geometry/contourTrace';
import type { Pt } from '../src/geometry/contourTrace';
import type { VecSegment } from '../src/geometry/topology';
import type { ElevationSpec } from '../src/geometry/recognizer';
import type { ConfigEdgeRole } from '../src/geometry/roofConfig';
import fix from './fixtures/denbou-p3-axis.json';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };
const mk = (p: number[][]): Pt[] => p.map((a) => ({ x: a[0], y: a[1] }));
const attrs = { trade: '屋根工事', item: 'roof_field' };
const roleSet = (edges: { role: ConfigEdgeRole }[] = []) => new Set(edges.map((e) => e.role));
const VALID: Set<ConfigEdgeRole> = new Set(['eave', 'ridge', 'hip', 'valley', 'gable', 'flashing', 'shed_ridge', 'grip']);

// ── ① Geometry 主導の写像（shape/slope/edges の源＝RoofModel） ──
// 切妻（F-3 の出力）→ shape gable・edges に eave/ridge/gable。
const gable = generateRoofFaces(mk([[0, 0], [400, 0], [400, 240], [0, 240]]), undefined, { pitch: 5 });
const cg = configFromRoofModel(gable);
ok(cg.roofs.length === 1, '単一 RoofUnit（Ver0）');
ok(cg.roofs[0].shape === 'gable', 'shape=gable（roofType 創発を写像）');
ok(cg.roofs[0].slope === 5, 'slope=5（面 pitch＝Geometry）');
const eg = roleSet(cg.roofs[0].edges);
ok(eg.has('eave') && eg.has('ridge') && eg.has('gable') && !eg.has('valley'), '切妻の辺ロール eave/ridge/gable を写像');

// 片流れ（1面）→ shape shed・edges eave/gable（棟なし）。
const shed = buildRoofModelFromFaces([{ vertices: mk([[0, 0], [400, 0], [400, 300], [0, 300]]), pitch: 5, attrs, eaveEdgeIndex: 0 }], { scale: 1 });
const cs = configFromRoofModel(shed);
ok(cs.roofs[0].shape === 'shed', '片流れ→shape=shed（創発）');
ok(roleSet(cs.roofs[0].edges).has('eave') && roleSet(cs.roofs[0].edges).has('gable') && !roleSet(cs.roofs[0].edges).has('ridge'), '片流れの辺ロール eave/gable（棟なし）');

// 寄棟（方形＝4三角）→ shape hip・edges eave/hip。
const hougyou = buildRoofModelFromFaces([
  { vertices: mk([[0, 0], [400, 0], [200, 200]]), pitch: 5, attrs, eaveEdgeIndex: 0 },
  { vertices: mk([[400, 0], [400, 400], [200, 200]]), pitch: 5, attrs, eaveEdgeIndex: 0 },
  { vertices: mk([[400, 400], [0, 400], [200, 200]]), pitch: 5, attrs, eaveEdgeIndex: 0 },
  { vertices: mk([[0, 400], [0, 0], [200, 200]]), pitch: 5, attrs, eaveEdgeIndex: 0 },
], { scale: 1 });
const ch = configFromRoofModel(hougyou);
ok(ch.roofs[0].shape === 'hip', '方形→shape=hip（創発）');
ok(roleSet(ch.roofs[0].edges).has('hip') && roleSet(ch.roofs[0].edges).has('eave'), '寄棟の辺ロール hip/eave を写像');

// ── ② ★規律：slope は Geometry から・Observation は補正だけ ──
const elev: ElevationSpec[] = [{ dir: 'east', pitches: [2], overhangs: [720, 600], labels: [] }];
const cd = configFromRoofModel(gable, elev); // model pitch=5, elevation pitch=[2]
ok(cd.roofs[0].slope === 5, '★slope は Geometry(5)＝Observation の pitch(2) で上書きしない');
const eaveEdge = (cd.roofs[0].edges || []).find((e) => e.role === 'eave');
ok(!!eaveEdge && eaveEdge.overhang === 600, '★overhang は Observation の補正（min 600）を eave に付与');
// Observation 無しでも Geometry から成立（生成源は Geometry）。
const cd0 = configFromRoofModel(gable);
ok(cd0.roofs[0].slope === 5 && !!cd0.roofs[0].shape, 'Observation 無しでも Geometry から Configuration が成立');
ok((cd0.roofs[0].edges || []).every((e) => e.overhang == null), 'Observation 無し→overhang は付かない（補正が無いだけ）');

// ── ③ 既存 LOCK 契約を壊さない（RoofConfiguration 形・ConfigEdgeRole 妥当・決定的） ──
ok(Array.isArray(cg.roofs) && cg.roofs.every((u) => typeof u.id === 'string'), '出力は RoofConfiguration（roofs: RoofUnit[]）');
ok((cg.roofs[0].edges || []).every((e) => VALID.has(e.role)), 'edges の role はすべて ConfigEdgeRole');
ok(JSON.stringify(configFromRoofModel(gable)) === JSON.stringify(configFromRoofModel(gable)), '決定的（同入力→同 Configuration）');

// ── ④ 伝法邸 Canonical：Facts→Candidate→Resolver→F-3→F-4 一本 ──
const segs: VecSegment[] = (fix.segments as number[][]).map((a) => ({ x1: a[0], y1: a[1], x2: a[2], y2: a[3] }));
const cfg: any = fix.canonical;
const F = geometryFeatures(traceOutline(wallFilter(segs, cfg.wallFilter), cfg.contourTrace)!.polygon);
const M = generateRoofFaces(resolveRoofOutline(F, analyzeRoof(F)).polygon, undefined, { scale: 1 });
const C = configFromRoofModel(M, undefined, { name: '伝法邸' });
ok(C.roofs.length === 1 && C.roofs[0].shape === 'gable', '伝法邸：一本通しで shape=gable');
ok(C.roofs[0].slope === 5 && roleSet(C.roofs[0].edges).has('ridge') && roleSet(C.roofs[0].edges).has('eave'), '伝法邸：slope・辺ロール（ridge/eave）が Geometry から');

if (fails.length) { console.error('❌ Roof Configuration (F-4) FAIL:\n' + fails.map((f) => '  - ' + f).join('\n')); process.exit(1); }
console.log(`✅ Roof Configuration (F-4 Ver0) test: 全 ${pass} 件合格（Geometry 主導：shape/slope/edges を RoofModel から写像・Observation は overhang 補正だけ・slope は上書きしない＋伝法邸で一本通し）`);
