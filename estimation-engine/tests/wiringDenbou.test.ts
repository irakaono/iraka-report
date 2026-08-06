// Phase F / 配線 結合テスト（Footprint → Runtime）。
//   ★受入基準（配線）：UI ではなく「Geometry Pipeline が Runtime に届いたこと」。Studio が呼ぶのと同じ関数列を
//     伝法邸 fixture で流し、Footprint→Facts→Candidate→Outline→DraftFace[]→RoofModel→roofQuantities を一本で通す。
//   ★座標変換（placeFootprint＝画像→キャンバス）は Studio/UI の関心事なので、ここでは幾何を1つの座標系で閉じて検証。
//     実機（PWA）の見た目確認はデプロイ後。設計上の合否はこの経路で判断する。
//   ★Runtime は RoofModel が正（F#6）。RoofConfiguration(F-4) はこの経路に入れない（消費者ができるまで凍結）。
import { footprintToRoofOutline } from '../src/geometry/roofPipeline';
import { roofFaceInputs } from '../src/geometry/roofFaces';
import { buildRoofModelFromFaces, faceArea, edgeFaceCount } from '../src/geometry/roofModel';
import { roofQuantities } from '../src/geometry/roofQuantities';
import { roleCounts } from '../src/geometry/roofEngine';
import { wallFilter } from '../src/geometry/wallFilter';
import { traceOutline } from '../src/geometry/contourTrace';
import type { VecSegment } from '../src/geometry/topology';
import fix from './fixtures/denbou-p3-axis.json';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };
const qval = (rq: { key: string; value: number }[], key: string) => rq.find((q) => q.key === key)?.value ?? 0;

// ── Studio と同じ入口：認識した Building Footprint Candidate（画像座標・38頂点） ──
const segs: VecSegment[] = (fix.segments as number[][]).map((a) => ({ x1: a[0], y1: a[1], x2: a[2], y2: a[3] }));
const cfg: any = fix.canonical;
const footprint = traceOutline(wallFilter(segs, cfg.wallFilter), cfg.contourTrace)!.polygon; // Phase E の footprint.polygon 相当

// ── Studio が呼ぶのと同じ関数列（座標変換は Studio 側なので省き、1座標系で通す） ──
const outline = footprintToRoofOutline(footprint).polygon;                 // F-1→F-2→Resolver（ポーチ/出窓除去）
const faces = roofFaceInputs(outline, undefined, { pitch: 5 });            // F-3（1面→分割面・各面が軒を指す）
const scale = 50;                                                          // px/m（任意・Runtime に渡すだけ）
const model = buildRoofModelFromFaces(
  faces.map((f) => ({ vertices: f.vertices, pitch: f.pitch, attrs: { trade: '屋根工事', item: '屋根材' }, eaveEdgeIndex: f.eaveEdgeIndex })),
  { scale },
);                                                                          // ★Studio の line 271 と同じ組み方
const rq = roofQuantities(model, scale);                                    // ★既存 Runtime（RoofModel が正）

// ── 一本が通ったことの固定 ──
ok(footprint.length === 38, `Footprint（認識外形）38頂点（実 ${footprint.length}）`);
ok(outline.length === 26, `Outline（Resolver 確定）26頂点＝ポーチ/出窓除去（実 ${outline.length}）`);
ok(faces.length === 2, `DraftFace[]＝2面（1面→分割・実 ${faces.length}）`);
ok(model.faces.length === 2, `RoofModel 2面（実 ${model.faces.length}）`);
ok(model.vertices.length === 27 && model.edges.length === 29, `外形なり 頂点27/辺29（Ver0 bbox 6/7 から更新・実 ${model.vertices.length}/${model.edges.length}）`);

// ★Ver1-1 一次の正＝面積保存：Σ面 planar = Outline（欠損・重複なく2面へ写像）。
const outlineArea = (() => { let a = 0; for (let i = 0; i < outline.length; i++) { const p = outline[i], q = outline[(i + 1) % outline.length]; a += p.x * q.y - q.x * p.y; } return Math.abs(a / 2); })();
const planarSum = model.faces.reduce((s, f) => s + faceArea(model, f), 0);
ok(Math.abs(planarSum - outlineArea) <= 1, `★面積保存：Σ面 planar = Outline（${Math.round(outlineArea)}px²・実 ${Math.round(planarSum)}）`);
ok([...edgeFaceCount(model).values()].filter((c) => c >= 2).length === 1, '共有棟辺はちょうど1本');

// ★受入基準：Geometry Pipeline が Runtime（数量）に届いた。実屋根面積は現行 pitch(5寸) での期待値±許容差。
const expArea = outlineArea / (scale * scale) * Math.sqrt(1 + 0.25);
ok(qval(rq, 'roofArea') > 0 && Math.abs(qval(rq, 'roofArea') - expArea) <= 0.1, `Runtime：実屋根面積 ${qval(rq, 'roofArea').toFixed(2)}㎡ ≈ 期待 ${expArea.toFixed(2)}（外形×5寸）`);
ok(qval(rq, 'ridgeLength') > 0 && qval(rq, 'eaveLength') > 0 && qval(rq, 'gableLength') > 0, `Runtime：棟/軒/ケラバ 有限・正値（棟 ${qval(rq, 'ridgeLength').toFixed(2)} / 軒 ${qval(rq, 'eaveLength').toFixed(2)} / ケラバ ${qval(rq, 'gableLength').toFixed(2)}）`);
ok(qval(rq, 'valleyLength') === 0, 'Ver1-1 は谷を作らない（valley 0）');

// ★一本を1回だけログ（Footprint→…→Runtime が Studio 経路で通った証拠）。
const roles = roleCounts(model);
console.log('── 配線 一本（Footprint → Runtime）─────────────');
console.log(`  Footprint(認識外形)        頂点 ${footprint.length}`);
console.log(`  → Facts → Candidate → Outline   頂点 ${outline.length}（ポーチ/出窓除去）`);
console.log(`  → DraftFace[]              ${faces.length} 面`);
console.log(`  → RoofModel               頂点 ${model.vertices.length} / 辺 ${model.edges.length} / 面 ${model.faces.length}  役割 ${JSON.stringify(roles)}`);
console.log(`  → roofQuantities          面積 ${qval(rq, 'roofArea').toFixed(2)}㎡ / 棟 ${qval(rq, 'ridgeLength').toFixed(2)}m / 軒 ${qval(rq, 'eaveLength').toFixed(2)}m / ケラバ ${qval(rq, 'gableLength').toFixed(2)}m`);
console.log('───────────────────────────────────────────────');

if (fails.length) { console.error('❌ 配線 結合テスト FAIL:\n' + fails.map((f) => '  - ' + f).join('\n')); process.exit(1); }
console.log(`✅ 配線 結合テスト（Footprint→Runtime）: 全 ${pass} 件合格（Studio と同じ関数列で伝法邸を一本通し・RoofModel が Runtime の正・F-4 は経路外）`);
