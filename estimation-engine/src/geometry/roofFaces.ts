// 甍AI Phase F / F-3 Roof Face Generator（Ver0）— Roof Outline → 既存 RoofModel（屋根面を置く）。
//   ★責務（PHASE-F-ROOF-ANALYZER.md §8）：屋根外形を面へ分割し、各面が自分の軒辺を指すところまで。
//     - **新 IR を定義しない。** 出力は既存 `RoofModel`（`buildRoofModelFromFaces` 経由の共有辺グラフ）。
//       面ごとに polygon を持たない（`Face.boundary` = 辺ID列）。棟/谷は「2面が共有する1本の辺」。
//     - **EdgeRole を格納しない。** ridge/hip/valley/eave/gable は `roofEngine.edgeRole()` が創発する。
//       F-3 は「面を置く＋勾配を割る＋各面の軒を指す（`slope.downhill.toEdgeId`）」まで。
//   ★入力＝Roof Outline（Resolver の確定 polygon）＋ ElevationSpec[]（recognizer R-2a・方位別勾配）。
//   ★Ver0 は最小実装：外形の bbox に **切妻を1本**置く（ridge＝長辺方向・上下/左右2面・各外側辺＝軒）。
//     - pitch は単一 fallback（ElevationSpec の最頻値／無ければ既定）。★面ごと方位別 pitch は Ver1
//       （面の下り方位 ↔ ElevationSpec.dir を北矢印基準で結ぶ）。
//     - 外形なりの分割（L 字・谷・寄棟・下屋）も Ver1 以降。Ver0 の受入基準は「屋根タイプを当てる」ではなく
//       「各面が正しい軒を指し、共有辺グラフ上で edgeRole が創発できる」こと（§8.2）。
//   ★純関数・UI 非依存。preset（`draftFaces.ts` の固定テンプレ）を外形駆動へ置き換える最小刻み。

import type { Pt } from './contourTrace';
import type { Point, RoofModel, FaceAttrs } from './roofModel';
import { buildRoofModelFromFaces } from './roofModel';
import type { ElevationSpec } from './recognizer';

export interface RoofFacesOptions {
  scale?: number;      // RoofModel の縮尺（px→m 等・既定 1）。
  pitch?: number;      // 明示 pitch（寸・優先）。無ければ elevation → 既定。
  attrs?: FaceAttrs;   // 面の属性（trade/item）。既定＝屋根葺き。
  id?: string;
  name?: string;
}

const DEFAULT_PITCH = 5;                                        // 寸（preset と同じ既定）。
const DEFAULT_ATTRS: FaceAttrs = { trade: '屋根工事', item: 'roof_field' };

// ElevationSpec[] から単一 pitch を拾う（Ver0 fallback＝最頻値／同数なら小さい方）。
//   ★方位別割当（面の下り方位 ↔ dir）は Ver1。Ver0 は全面同一 pitch。
export function pickPitch(elevation?: ElevationSpec[], fallback: number = DEFAULT_PITCH): number {
  const all = (elevation ?? []).flatMap((e) => e.pitches).filter((p) => p > 0);
  if (!all.length) return fallback;
  const freq = new Map<number, number>();
  all.forEach((p) => freq.set(p, (freq.get(p) ?? 0) + 1));
  return [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

function bboxOf(poly: Pt[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of poly) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1 };
}

// F-3 core：Roof Outline → 屋根面の入力列（vertices/pitch/eave）。★役割は付けない・各面が自分の軒を指す。
//   Ver0＝外形 bbox に切妻を1本（ridge＝長辺方向・上下/左右2面・各外側辺＝軒）。★配線の接続点：
//   Studio はこの列を編集状態（faces）に持ち、buildRoofModelFromFaces で RoofModel を組む（既存 Runtime へ）。
//   attrs（trade/item＝costing）はここでは付けない（幾何の関心事ではない）。generateRoofFaces / Studio が付ける。
export interface RoofFaceInput { vertices: Point[]; pitch: number; eaveEdgeIndex: number }

export function roofFaceInputs(outline: Pt[], elevation?: ElevationSpec[], opts: { pitch?: number } = {}): RoofFaceInput[] {
  const pitch = opts.pitch ?? pickPitch(elevation);
  const { x0, y0, x1, y1 } = bboxOf(outline);
  const w = x1 - x0, h = y1 - y0;
  if (w >= h) {
    // ridge 水平（長辺＝x方向）。上下2面・各外側水平辺＝軒（eaveEdgeIndex=0）。共有辺（中央 y=midY）＝棟の素。
    const midY = (y0 + y1) / 2;
    return [
      { vertices: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: midY }, { x: x0, y: midY }], pitch, eaveEdgeIndex: 0 }, // 上：軒＝上辺
      { vertices: [{ x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: midY }, { x: x1, y: midY }], pitch, eaveEdgeIndex: 0 }, // 下：軒＝下辺
    ];
  }
  // ridge 垂直（長辺＝y方向）。左右2面・各外側垂直辺＝軒（eaveEdgeIndex=0）。共有辺（中央 x=midX）＝棟の素。
  const midX = (x0 + x1) / 2;
  return [
    { vertices: [{ x: x0, y: y1 }, { x: x0, y: y0 }, { x: midX, y: y0 }, { x: midX, y: y1 }], pitch, eaveEdgeIndex: 0 }, // 左：軒＝左辺
    { vertices: [{ x: x1, y: y0 }, { x: x1, y: y1 }, { x: midX, y: y1 }, { x: midX, y: y0 }], pitch, eaveEdgeIndex: 0 }, // 右：軒＝右辺
  ];
}

// Roof Outline → RoofModel（F-3 Ver0）。roofFaceInputs に attrs（costing）を足して共有辺グラフを組む。★役割は付けない（創発）。
export function generateRoofFaces(outline: Pt[], elevation?: ElevationSpec[], opts: RoofFacesOptions = {}): RoofModel {
  const scale = opts.scale ?? 1;
  const attrs = opts.attrs ?? DEFAULT_ATTRS;
  const faces = roofFaceInputs(outline, elevation, { pitch: opts.pitch }).map((f) => ({ ...f, attrs }));
  return buildRoofModelFromFaces(faces, { scale, id: opts.id, name: opts.name });
}
