// 甍AI Geometry Knowledge — 変換（寸勾配 ↔ 比率 ↔ 角度）。すべて純関数・派生値。
// KCP / KKai / Estimation OS で共通利用できる屋根幾何知識の一部。
export const convert = {
  /** 寸勾配 → 勾配比(rise/run)。例: 4.5寸 → 0.45 */
  sunToRatio(pitch: number): number { return pitch / 10; },
  /** 寸勾配 → 角度(度)。例: 10寸 → 45 */
  sunToDegree(pitch: number): number { return (Math.atan(pitch / 10) * 180) / Math.PI; },
  /** 角度(度) → 寸勾配。例: 45度 → 10寸 */
  degreeToSun(deg: number): number { return Math.tan((deg * Math.PI) / 180) * 10; },
};
