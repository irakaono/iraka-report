// 甍AI Geometry Knowledge — 屋根の伸び率ライブラリ（純関数・派生値・保存しない）。
//   m = 勾配/10。 面/登り: √(1+m²)、 隅棟/谷: √(1+m²/2)、 水平(棟/軒): 1。
//   隅棟＝谷（平面45°＋勾配で三平方が同じ）。ケラバ(gable)は登り＝面積と同値。
//   値は式から算出（表を転記しない＝常に正確）。数量エンジンは「掛けるだけ」。
// 参考検算: area(4寸)=1.077 / area(5寸)=1.118 / area(10寸)=1.414、
//           hip(4寸)=1.039 / hip(5寸)=1.061 / hip(10寸)=1.225。
import { convert } from './convert';

function areaRatio(pitch: number): number { const m = convert.sunToRatio(pitch); return Math.sqrt(1 + m * m); }
function hipRatio(pitch: number): number { const m = convert.sunToRatio(pitch); return Math.sqrt(1 + (m * m) / 2); }
// 隅棟(真隅)の伸び率は「基準」が3種。用途で使い分ける（すべて式・派生・真隅=両面同勾配のみ）:
//   hip()            = √(1+m²/2)        図面で測る隅棟の「平面対角長」に掛ける（roof.ts の実長算出）
//   hipVsHorizontal  = √(2+m²)          建物の片方向「水平距離」に掛ける（隅棟長さ電卓）
//   hipVsSlope       = √(2+m²)/√(1+m²)  流れ(common rafter)の実長に掛ける
//   関係: hipVsHorizontal = hip × √2 ,  hipVsSlope = hipVsHorizontal / area。
function hipVsHorizontalRatio(pitch: number): number { const m = convert.sunToRatio(pitch); return Math.sqrt(2 + m * m); }
function hipVsSlopeRatio(pitch: number): number { const m = convert.sunToRatio(pitch); return Math.sqrt(2 + m * m) / Math.sqrt(1 + m * m); }

export const stretch = {
  area(pitch: number): number { return areaRatio(pitch); },    // 屋根面・スロープ
  gable(pitch: number): number { return areaRatio(pitch); },   // ケラバ（登り＝面積と同値）
  hip(pitch: number): number { return hipRatio(pitch); },      // 隅棟（平面対角長 基準）
  valley(pitch: number): number { return hipRatio(pitch); },   // 谷（＝隅棟・平面対角長 基準）
  hipVsHorizontal(pitch: number): number { return hipVsHorizontalRatio(pitch); }, // 真隅・片方向水平距離 基準
  hipVsSlope(pitch: number): number { return hipVsSlopeRatio(pitch); },           // 真隅・流れ実長 基準
  ridge(): number { return 1; },                               // 棟（水平）
  eave(): number { return 1; },                                // 軒先（水平）
};
