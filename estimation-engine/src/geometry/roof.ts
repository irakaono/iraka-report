// 甍AI Geometry Knowledge — 屋根の派生数量（純関数）。
// Evidence First: 保存するのは pitch と平面量（平面積 / 平面長）だけ。実量はここで毎回算出する。
import { stretch } from './stretch';
import { convert } from './convert';

export const roof = {
  /** 平面積 × 面積伸び率 → 実屋根面積 */
  actualArea(planArea: number, pitch: number): number { return planArea * stretch.area(pitch); },
  /** 隅棟の平面長 × 隅棟伸び率 → 実長 */
  actualHipLength(hipPlanLength: number, pitch: number): number { return hipPlanLength * stretch.hip(pitch); },
  /** 谷の平面長 × 谷伸び率 → 実長 */
  actualValleyLength(valleyPlanLength: number, pitch: number): number { return valleyPlanLength * stretch.valley(pitch); },
  /** ケラバの平面長 × ケラバ伸び率 → 実長 */
  actualGableLength(gablePlanLength: number, pitch: number): number { return gablePlanLength * stretch.gable(pitch); },
  /** 水平距離(run) × 勾配比 → 垂直高さ（軒高・棟高計算の土台） */
  pitchHeight(run: number, pitch: number): number { return run * convert.sunToRatio(pitch); },
};
