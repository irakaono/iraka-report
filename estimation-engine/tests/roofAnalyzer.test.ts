// Phase F / F-2 Roof Analyzer（Ver0）テスト。
//   ①単体：小さな張り出し→roof_exclusion_candidate（根拠付き）／大きい張り出し→roof_keep_candidate／矩形→本体keepのみ／凹み→valley。
//   ②伝法邸 Canonical：Geometry Facts → 候補。★候補の kind は3種のみ・reason は数値を持つ・判定名（ポーチ/出窓/庇）は出さない。
//     ★F-2 は候補を返すだけ（外形＝ポリゴンは返さない・変更しない）。
import { analyzeRoof } from '../src/geometry/roofAnalyzer';
import type { RoofCandidate } from '../src/geometry/roofAnalyzer';
import { geometryFeatures } from '../src/geometry/footprintFeatures';
import { wallFilter } from '../src/geometry/wallFilter';
import { traceOutline } from '../src/geometry/contourTrace';
import type { Pt } from '../src/geometry/contourTrace';
import type { VecSegment } from '../src/geometry/topology';
import fix from './fixtures/denbou-p3-axis.json';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };
const KINDS = ['roof_keep_candidate', 'roof_exclusion_candidate', 'valley_candidate'];
const ref = (cs: RoofCandidate[], r: string) => cs.find((c) => c.featureRef === r);

// ── ① 単体 ─────────────────────────────────────────────
// 矩形：本体 keep 候補が1つだけ（張り出し/凹みなし）。
const rect: Pt[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }];
const cr = analyzeRoof(geometryFeatures(rect));
ok(cr.length === 1 && cr[0].kind === 'roof_keep_candidate' && cr[0].featureRef === 'body', '矩形は本体keep候補1つだけ');
ok(typeof cr[0].reason.rectangularity === 'number', '本体候補は矩形性を根拠に持つ');

// 大きな建物＋小さな張り出し（奥行24×幅96）→ roof_exclusion_candidate（★根拠に数値）。
const smallBump: Pt[] = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 600 }, { x: 548, y: 600 }, { x: 548, y: 624 }, { x: 452, y: 624 }, { x: 452, y: 600 }, { x: 0, y: 600 }];
const cb = ref(analyzeRoof(geometryFeatures(smallBump)), 'protrusion-0')!;
ok(cb.kind === 'roof_exclusion_candidate' && cb.reason.rule === 'shallow_narrow_protrusion', '小さな張り出し→除外候補(shallow_narrow_protrusion)');
ok(cb.reason.depth === 24 && cb.reason.width === 96 && cb.reason.ratio === 0.25, '除外候補の根拠が数値（奥行24/幅96/比率0.25）');

// 大きな張り出し（300×300）→ roof_keep_candidate（下屋相当・保持）。
const bigProt: Pt[] = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 600 }, { x: 650, y: 600 }, { x: 650, y: 900 }, { x: 350, y: 900 }, { x: 350, y: 600 }, { x: 0, y: 600 }];
const cbp = ref(analyzeRoof(geometryFeatures(bigProt)), 'protrusion-0')!;
ok(cbp.kind === 'roof_keep_candidate' && cbp.reason.rule === 'large_protrusion', '大きな張り出し→保持候補(large_protrusion)');

// 大きな建物＋大きな凹み → valley_candidate。
const bigNotch: Pt[] = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 600 }, { x: 550, y: 600 }, { x: 550, y: 480 }, { x: 450, y: 480 }, { x: 450, y: 600 }, { x: 0, y: 600 }];
const cn = ref(analyzeRoof(geometryFeatures(bigNotch)), 'notch-0');
ok(!!cn && cn.kind === 'valley_candidate' && cn.reason.rule === 'notch_forms_valley', '大きな凹み→谷候補(notch_forms_valley)');

// ── ② 伝法邸 Canonical 回帰 ──────────────────────────────
const segs: VecSegment[] = (fix.segments as number[][]).map((a) => ({ x1: a[0], y1: a[1], x2: a[2], y2: a[3] }));
const cfg: any = fix.canonical;
const walls = wallFilter(segs, cfg.wallFilter);
const F = geometryFeatures(traceOutline(walls, cfg.contourTrace)!.polygon);
const C = analyzeRoof(F);
const cnt = (k: string) => C.filter((c) => c.kind === k).length;

ok(C.length === 7 && cnt('roof_keep_candidate') === 1 && cnt('roof_exclusion_candidate') === 4 && cnt('valley_candidate') === 2,
  `候補 計7（keep1/exclusion4/valley2）実 ${C.length}(${cnt('roof_keep_candidate')}/${cnt('roof_exclusion_candidate')}/${cnt('valley_candidate')})`);
ok(C.every((c) => KINDS.includes(c.kind)), '候補の kind は3種のみ');

// ★伝法邸の小さな張り出し（出窓相当・幅24）が根拠付きで除外候補になっている。
const excl = C.filter((c) => c.kind === 'roof_exclusion_candidate');
ok(excl.length === 4 && excl.every((c) => c.reason.rule === 'shallow_narrow_protrusion'), '4つの小さな張り出しが除外候補');
ok(excl.every((c) => typeof c.reason.depth === 'number' && typeof c.reason.width === 'number' && typeof c.reason.ratio === 'number'), '除外候補の根拠は数値（奥行/幅/比率）');
ok(excl.some((c) => c.reason.width === 24), '幅24の細い張り出し（出窓相当スケール）を除外候補として検出');

// 本体 keep（矩形性）と谷候補（数値）。
ok(!!ref(C, 'body') && ref(C, 'body')!.kind === 'roof_keep_candidate' && typeof ref(C, 'body')!.reason.rectangularity === 'number', '本体keep候補（矩形性を根拠）');
ok(C.filter((c) => c.kind === 'valley_candidate').every((c) => typeof c.reason.depth === 'number' && typeof c.reason.width === 'number'), '谷候補の根拠は数値');

// ★Semantic（判定名）を出していない：候補全体の JSON にポーチ/出窓/庇/下屋 等が出てこない。
const dump = JSON.stringify(C);
ok(!/ポーチ|porch|出窓|庇|下屋|バルコニー|eave|gable/.test(dump), '判定名（ポーチ/出窓/庇/下屋 等の建築セマンティック）を出していない');

// ★F-2 は候補だけ返す（外形＝ポリゴン/頂点を返さない・変更しない）。
ok(Array.isArray(C) && C.every((c) => Object.keys(c).sort().join(',') === 'featureRef,kind,reason'), 'F-2 は候補のみ返す（polygon/vertices を持たない）');

if (fails.length) { console.error('❌ Roof Analyzer FAIL:\n' + fails.map((f) => '  - ' + f).join('\n')); process.exit(1); }
console.log(`✅ Roof Analyzer (F-2 Ver0) test: 全 ${pass} 件合格（除外/保持/谷を根拠付きで返す・判定名は出さない・外形は変更しない＋伝法邸 keep1/exclusion4/valley2）`);
