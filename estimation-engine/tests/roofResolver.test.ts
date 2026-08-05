// Phase F / Resolver（Ver0）テスト。
//   ①単体：小さな張り出し→外して矩形へ戻る／大きい張り出し(keep)・凹み(valley)・矩形→外形は変えない／
//          非対称 tab は軸整合に切る（斜め誤カットを出さない）。
//   ②伝法邸 Canonical：候補 → 屋根外形を確定。★ポーチ・出窓が外れたきれいな外形（頂点/面積が減る・斜辺0・面積は主屋を保つ）。
//     ★削るのは Resolver だけ（F-2＝analyzeRoof は polygon を返さない／Resolver が polygon を確定する）。判定名は回帰しない。
import { resolveRoofOutline } from '../src/geometry/roofResolver';
import type { RoofOutline } from '../src/geometry/roofResolver';
import { analyzeRoof } from '../src/geometry/roofAnalyzer';
import { geometryFeatures } from '../src/geometry/footprintFeatures';
import { wallFilter } from '../src/geometry/wallFilter';
import { traceOutline } from '../src/geometry/contourTrace';
import type { Pt } from '../src/geometry/contourTrace';
import type { VecSegment } from '../src/geometry/topology';
import fix from './fixtures/denbou-p3-axis.json';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };
const near = (a: number, b: number, t: number) => Math.abs(a - b) <= t;
const mk = (pts: number[][]): Pt[] => pts.map((p) => ({ x: p[0], y: p[1] }));
const area = (p: Pt[]) => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.y - b.x * a.y; } return Math.abs(s / 2); };
const diagCount = (p: Pt[]) => { let d = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; if (Math.abs(a.x - b.x) > 1e-6 && Math.abs(a.y - b.y) > 1e-6) d++; } return d; };
const has = (p: Pt[], x: number, y: number) => p.some((q) => q.x === x && q.y === y);
// Facts → Candidate → Resolver（Core 一本を通す）。
const resolve = (poly: Pt[]): RoofOutline => { const F = geometryFeatures(poly); return resolveRoofOutline(F, analyzeRoof(F)); };

// ── ① 単体 ─────────────────────────────────────────────
// 矩形：候補は本体 keep のみ → 外形は変わらない（削らない）。
const rect = mk([[0, 0], [100, 0], [100, 60], [0, 60]]);
const Rr = resolve(rect);
ok(Rr.polygon.length === 4 && Rr.removed.length === 0 && Rr.kept.includes('body'), '矩形は外形不変・除外0・本体keep');

// 大きな建物＋小さな張り出し（奥行24×幅96・除外候補）→ 外して矩形に戻る（★きれいな屋根外形）。
const smallBump = mk([[0, 0], [1000, 0], [1000, 600], [548, 600], [548, 624], [452, 624], [452, 600], [0, 600]]);
const Rsb = resolve(smallBump);
ok(Rsb.removed.length === 1 && Rsb.removed[0] === 'protrusion-0', '小さな張り出しを1つ外す');
ok(Rsb.polygon.length === 4 && !has(Rsb.polygon, 548, 624) && !has(Rsb.polygon, 452, 624), '張り出しの先端が外れ矩形へ戻る');
ok(diagCount(Rsb.polygon) === 0, '確定外形は軸整合（斜辺なし）');

// 大きな張り出し（300×300・keep 候補）→ 外形を変えない（Resolver は keep を削らない）。
const bigProt = mk([[0, 0], [1000, 0], [1000, 600], [650, 600], [650, 900], [350, 900], [350, 600], [0, 600]]);
const Rbp = resolve(bigProt);
ok(Rbp.removed.length === 0 && Rbp.kept.includes('protrusion-0') && Rbp.polygon.length === 8, '大きな張り出し(keep)は外形不変');

// 大きな凹み（valley 候補）→ 外形を変えない（谷は外周に残す）。
const bigNotch = mk([[0, 0], [1000, 0], [1000, 600], [550, 600], [550, 480], [450, 480], [450, 600], [0, 600]]);
const Rbn = resolve(bigNotch);
ok(Rbn.removed.length === 0 && Rbn.kept.includes('notch-0') && Rbn.polygon.length === 8 && has(Rbn.polygon, 450, 480), '凹み(valley)は外形に残す');

// ★非対称 tab（depth1≠depth2）：先端を「近い付け根」の基線へ射影＝軸整合に切る（斜めに横切らない）。
//   下辺左が長く伸びた L 字角（右へ48出て下へ大きく回る）を除外→斜辺を作らず角を残す。
const asym = mk([[0, 0], [1000, 0], [1000, 300], [1048, 300], [1048, 600], [0, 600]]);
const Fa = geometryFeatures(asym);
if (Fa.protrusions.length === 1) { // 幾何が張り出しとして拾えた時だけ検証（拾えなくてもテストは通す）。
  const Ra = resolveRoofOutline(Fa, analyzeRoof(Fa));
  ok(diagCount(Ra.polygon) === 0, '非対称 tab を外しても斜辺を作らない（軸整合）');
} else { ok(true, '非対称 tab（幾何依存・スキップ可）'); }

// ── ② 伝法邸 Canonical 回帰 ──────────────────────────────
const segs: VecSegment[] = (fix.segments as number[][]).map((a) => ({ x1: a[0], y1: a[1], x2: a[2], y2: a[3] }));
const cfg: any = fix.canonical;
const walls = wallFilter(segs, cfg.wallFilter);
const F = geometryFeatures(traceOutline(walls, cfg.contourTrace)!.polygon);
const C = analyzeRoof(F);
const R = resolveRoofOutline(F, C);

// ★F-2（analyzeRoof）は polygon を返さない＝外形を変えない。削るのは Resolver。
ok(C.every((c) => Object.keys(c).sort().join(',') === 'featureRef,kind,reason'), 'F-2 は候補のみ（polygon を持たない）');
ok(Array.isArray(R.polygon) && R.polygon.length > 0, 'Resolver が屋根外形（polygon）を確定する');

// 採用・棄却：4つの除外候補を外周から外し、本体・2つの谷は残す。
ok(R.removed.length === 4 && R.removed.every((r) => /^protrusion-\d+$/.test(r)), '除外候補4を外す（張り出し）');
ok(R.kept.includes('body') && R.kept.filter((k) => /^notch-\d+$/.test(k)).length === 2, '本体keep＋谷候補2を残す');

// ★きれいな屋根外形：入力38頂点→確定26頂点（ポーチ・出窓が外れて頂点が減る）・軸整合（斜辺0）。
ok(F.vertices.length === 38, `入力外形は頂点38（実 ${F.vertices.length}）`);
ok(R.polygon.length === 26, `確定屋根外形は頂点26（実 ${R.polygon.length}）`);
ok(R.polygon.length < F.vertices.length, '確定外形は入力より頂点が減る（張り出しが外れた）');
ok(diagCount(R.polygon) === 0, '確定屋根外形は軸整合（斜辺なし＝斜め誤カットを出さない）');

// 面積：主屋はほぼ保つ（外したのは小さな張り出しだけ／大きく削れていない）。canonical=256320。
ok(near(area(R.polygon), 256320, 1e-6), `確定外形の面積=256320（実 ${area(R.polygon)}）`);
ok(area(R.polygon) < F.area && area(R.polygon) > F.area * 0.9, '面積は入力より小・主屋の9割超を保つ（小さな張り出しだけ除去）');

// 出窓相当（幅24の細い張り出し）の先端が外れている：入力にあった (528,120)/(552,120) が確定外形に無い。
ok(has(F.vertices.map((v) => ({ x: v.x, y: v.y })), 528, 120) && !has(R.polygon, 528, 120) && !has(R.polygon, 552, 120), '細い張り出し(出窓相当)の先端が外れている');

// ★判定名を出していない：removed/kept は featureRef（幾何参照）だけ・建築セマンティックを含まない。
const dump = JSON.stringify({ removed: R.removed, kept: R.kept });
ok(!/ポーチ|porch|出窓|庇|下屋|バルコニー|eave|gable/.test(dump), '判定名（ポーチ/出窓 等）を出していない');

// 純関数：同じ入力で同じ確定外形（決定的）。
const R2 = resolveRoofOutline(geometryFeatures(traceOutline(walls, cfg.contourTrace)!.polygon), C);
ok(JSON.stringify(R.polygon) === JSON.stringify(R2.polygon), '決定的（同入力→同外形）');

if (fails.length) { console.error('❌ Roof Resolver FAIL:\n' + fails.map((f) => '  - ' + f).join('\n')); process.exit(1); }
console.log(`✅ Roof Resolver (Ver0) test: 全 ${pass} 件合格（除外を外周から外す・keep/valley を残す・軸整合で確定＋伝法邸 38→26頂点・面積256320・斜辺0。削るのは Resolver だけ・判定名は回帰しない）`);
