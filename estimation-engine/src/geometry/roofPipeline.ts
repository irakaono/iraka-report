// 甍AI Phase F / Roof Pipeline — 認識外形（Building Footprint Candidate）→ 屋根解釈の合成（純関数の一本）。
//   ★配線用の合成層：F-1（geometryFeatures）→ F-2（analyzeRoof）→ Resolver（resolveRoofOutline）を1本に束ねる。
//     - 認識由来の幾何解釈は**入力の座標空間で閉じる**（画像座標のまま）。閾値・伝法邸 canonical 回帰を壊さない。
//     - Studio は確定 Outline を placeFootprint 相当でキャンバス座標へ写像してから F-3（roofFaceInputs）を呼ぶ。
//   ★ここは合成だけ（新しい判断はしない）。各段の責務は §8 の LOCK どおり：Resolver だけが外形を確定する。

import type { Pt } from './contourTrace';
import { geometryFeatures } from './footprintFeatures';
import { analyzeRoof } from './roofAnalyzer';
import { resolveRoofOutline } from './roofResolver';
import type { RoofOutline } from './roofResolver';

// Building Footprint Candidate(polygon) → Roof Outline（F-1 → F-2 → Resolver）。
//   ★ポーチ/出窓を除いた確定屋根外形を返す。座標系は入力のまま。
export function footprintToRoofOutline(polygon: Pt[]): RoofOutline {
  const feature = geometryFeatures(polygon);
  const candidates = analyzeRoof(feature);
  return resolveRoofOutline(feature, candidates);
}
