// 甍AI スケール較正（L0.5）— 図面の px→m を独立した Runtime データとして持つ。
//   ★開発用定数 SCALE=50 の置き換え。較正が「どの図面を・どの2点で・どの既知寸法で」決めたかを保存する。
//   ★将来（寸法線クリック / スケールバー自動認識 / CADベクタ長取得）も同じ契約：method が変わるだけで pxPerMeter の意味は不変。
import type { Point } from './roofModel';

export type CalibrationMethod = 'manual_2pt' | 'dimension_line' | 'scale_bar' | 'cad_vector';

export interface Calibration {
  id: string;
  drawingId: string;       // どの図面の較正か（'plan' | 'elevation' 等）
  pxPerMeter: number;      // 1m あたりの px（これが Quantity 計算の scale）
  sourceLength: number;    // 較正に使った既知実寸（m）
  p1: Point;               // 較正2点（px）
  p2: Point;
  method: CalibrationMethod;
}

export function pxDistance(p1: Point, p2: Point): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

// 2点＋既知実寸(m)から Calibration を作る。将来の method でも入口が変わるだけで戻り値の契約は同じ。
export function calibrateFrom2Points(args: {
  id: string; drawingId: string; p1: Point; p2: Point; sourceLength: number; method?: CalibrationMethod;
}): Calibration {
  const { id, drawingId, p1, p2, sourceLength, method = 'manual_2pt' } = args;
  if (!(sourceLength > 0)) throw new Error('sourceLength は正の実寸(m)が必要');
  const px = pxDistance(p1, p2);
  if (!(px > 0)) throw new Error('較正2点が同一位置（px距離が0）');
  return { id, drawingId, pxPerMeter: px / sourceLength, sourceLength, p1, p2, method };
}

// 較正が無いときの開発用フォールバック（旧 SCALE=50）。実測は必ず較正を通す。
export const DEV_PX_PER_METER = 50;

// 有効 scale：較正があればその pxPerMeter、無ければ開発用フォールバック。
export function effectiveScale(cal: Calibration | null | undefined): number {
  return cal && cal.pxPerMeter > 0 ? cal.pxPerMeter : DEV_PX_PER_METER;
}
