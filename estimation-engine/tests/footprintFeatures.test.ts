// Phase F / F-1 Footprint Feature Extractor テスト。
//   ①単体：矩形＝tab 0・矩形性1／張り出し1つ／凹み1つ／内角。
//   ②伝法邸 Canonical：footprint → Feature IR。★テストするのは Feature（頂点/辺/張り出しの位置・寸法・比率）だけ。
//     「ポーチ/出窓」等の判定名は一切テストしない（F#9・それは F-2 Roof Analyzer の責務）。
import { geometryFeatures } from '../src/geometry/footprintFeatures';
import { wallFilter } from '../src/geometry/wallFilter';
import { traceOutline } from '../src/geometry/contourTrace';
import type { Pt } from '../src/geometry/contourTrace';
import type { VecSegment } from '../src/geometry/topology';
import fix from './fixtures/denbou-p3-axis.json';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };
const near = (a: number, b: number, t: number) => Math.abs(a - b) <= t;

// ── ① 単体 ────────────────────────────────────────────
// 単純な矩形：張り出し/凹み 0・矩形性 1・出角4・内角すべて90。
const rect: Pt[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }];
const fr = geometryFeatures(rect);
ok(fr.protrusions.length === 0 && fr.notches.length === 0, '矩形は tab なし');
ok(near(fr.rectangularity, 1, 1e-9), '矩形の矩形性=1');
ok(fr.vertices.filter((v) => v.convex).length === 4, '矩形は出角4');
ok(fr.vertices.every((v) => near(v.interiorAngleDeg, 90, 1e-6)), '矩形の内角すべて90');
ok(near(fr.perimeter, 320, 1e-9) && near(fr.area, 6000, 1e-9), '矩形の周長320・面積6000');

// 張り出し1つ（下辺から外へ矩形バンプ）。
const prot: Pt[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 60, y: 60 }, { x: 60, y: 80 }, { x: 40, y: 80 }, { x: 40, y: 60 }, { x: 0, y: 60 }];
const fp1 = geometryFeatures(prot);
ok(fp1.protrusions.length === 1 && fp1.notches.length === 0, '張り出し1・凹み0');
ok(fp1.protrusions[0].depth === 20 && fp1.protrusions[0].width === 20 && near(fp1.protrusions[0].ratio, 1, 1e-9), '張り出しの奥行20×幅20・比率1');

// 凹み1つ（下辺から内へ矩形カット）。
const notch: Pt[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 60, y: 60 }, { x: 60, y: 40 }, { x: 40, y: 40 }, { x: 40, y: 60 }, { x: 0, y: 60 }];
const fn1 = geometryFeatures(notch);
ok(fn1.notches.length === 1 && fn1.protrusions.length === 0, '凹み1・張り出し0');
ok(fn1.notches[0].depth === 20 && fn1.notches[0].width === 20, '凹みの奥行20×幅20');
// 入角（reflex）が2つ出る（カットの根元）。
ok(fn1.vertices.filter((v) => !v.convex).length === 2, '凹みは入角2');

// ── ② 伝法邸 Canonical 回帰 ───────────────────────────
const segs: VecSegment[] = (fix.segments as number[][]).map((a) => ({ x1: a[0], y1: a[1], x2: a[2], y2: a[3] }));
const cfg: any = fix.canonical;
const walls = wallFilter(segs, cfg.wallFilter);
const poly = traceOutline(walls, cfg.contourTrace)!.polygon;
const F = geometryFeatures(poly);

// 頂点・内角（幾何の健全性）。
ok(F.vertices.length === cfg.vertices, `頂点数=${cfg.vertices}（実 ${F.vertices.length}）`);
ok(F.vertices.filter((v) => v.convex).length === 21 && F.vertices.filter((v) => !v.convex).length === 17, '出角21・入角17');
const angSum = F.vertices.reduce((s, v) => s + v.interiorAngleDeg, 0);
ok(near(angSum, (F.vertices.length - 2) * 180, 1e-6), `内角和=(n-2)×180=${(F.vertices.length - 2) * 180}（実 ${angSum.toFixed(1)}）`);

// 辺・周長・長辺短辺。
ok(F.edges.length === cfg.vertices, '辺数=頂点数');
ok(near(F.perimeter, 3504, 1e-6), `周長3504（実 ${F.perimeter}）`);
ok(F.edges.find((e) => e.longest)!.length === 576 && F.edges.find((e) => e.shortest)!.length === 24, '長辺576・短辺24');

// ★Canonical との突き合わせ：面積・BBox は fixture の唯一の正と一致（F#9・O#11）。
ok(F.area === cfg.areaPx, `面積=canonical.areaPx=${cfg.areaPx}（実 ${F.area}）`);
ok(F.bbox.x0 === cfg.bbox.x0 && F.bbox.y0 === cfg.bbox.y0 && F.bbox.x1 === cfg.bbox.x1 && F.bbox.y1 === cfg.bbox.y1, 'BBox=canonical.bbox');
ok(near(F.rectangularity, 0.696, 0.005), `矩形性≈0.696（実 ${F.rectangularity.toFixed(3)}）`);

// 張り出し/凹み（位置・寸法・比率だけ。判定名はテストしない・F#9）。凸凹パターンで本体/腕は除外済み。
ok(F.protrusions.length === 4 && F.notches.length === 5, `張り出し4・凹み5（実 ${F.protrusions.length}/${F.notches.length}）`);
ok(F.protrusions.every((t) => near(t.ratio, t.width > 0 ? t.depth / t.width : 0, 1e-9)), '比率=奥行/幅 が整合');
// 右側に小さな張り出し（出窓相当スケール・幅≤72）が存在する（＝Feature として拾えている）。
ok(F.protrusions.some((t) => t.capMid.x >= 760 && t.width <= 72), '右側に小さな張り出し（出窓相当スケール）を検出');
// 底部（大きな y）に張り出し（玄関ポーチ相当スケール）が存在する。
ok(F.protrusions.some((t) => t.capMid.y >= 620), '底部に張り出し（ポーチ相当スケール）を検出');

if (fails.length) { console.error('❌ Footprint Feature FAIL:\n' + fails.map((f) => '  - ' + f).join('\n')); process.exit(1); }
console.log(`✅ Footprint Feature (F-1) test: 全 ${pass} 件合格（矩形/張り出し/凹み/内角＋伝法邸で頂点38・面積/BBox=canonical・張り出し4/凹み5。判定名は付けない）`);
