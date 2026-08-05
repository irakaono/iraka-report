// 甍AI Phase F / F-2 Roof Analyzer（Ver0・Rule Candidate Producer）— Geometry Facts → Roof Candidate[]。
//   ★責務（PHASE-F-ROOF-ANALYZER.md §1.2 / §6.2 / §7）：Geometry Facts を**解釈して候補**にする。
//     - **判定名（玄関ポーチ/出窓/庇）は付けない**。候補は「屋根に含める／除外する／谷になる」だけ（Semantic ではない）。
//     - **外形を変更しない**。F-2 は候補を出すだけ。採用・棄却は Resolver、Roof Outline は Resolver の確定結果。
//       → F-2 が勝手にポリゴンを削って正にする事故を防ぐ。
//   ★純関数・UI 非依存。Ver0 は Rule だけ（confidence・Resolver・複数 producer は必要になってから）。
//   ★軸：屋根・雨樋積算に効くか。しきい値は建物短辺に対する相対値（縮尺非依存）。実寸較正は将来。

import type { GeometryFeature } from './footprintFeatures';

export type RoofCandidateKind = 'roof_keep_candidate' | 'roof_exclusion_candidate' | 'valley_candidate';

// 機械判定の根拠。rule（文章）だけでなく数値（depth/width/ratio 等）を保持する＝後段 Resolver / UI が使える。
export interface RoofCandidateReason {
  rule: string;
  depth?: number;
  width?: number;
  ratio?: number;          // 奥行 / 幅
  rectangularity?: number; // 本体候補の根拠
}
export interface RoofCandidate {
  kind: RoofCandidateKind;
  featureRef: string;      // Geometry Facts の要素参照：'body' / 'protrusion-<i>' / 'notch-<i>'
  reason: RoofCandidateReason;
}

export interface RoofAnalyzerOptions {
  smallFrac?: number;  // 張り出しの短辺が建物短辺のこの割合未満なら「浅く狭い」＝除外候補。既定 0.12。
  valleyFrac?: number; // 凹みの短辺が建物短辺のこの割合以上なら谷候補。既定 0.05。
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

// Geometry Facts → Roof Candidate[]（判定名を付けない・外形を変更しない）。
export function analyzeRoof(feature: GeometryFeature, opt: RoofAnalyzerOptions = {}): RoofCandidate[] {
  const smallFrac = opt.smallFrac ?? 0.12;
  const valleyFrac = opt.valleyFrac ?? 0.05;
  const bw = feature.bbox.x1 - feature.bbox.x0, bh = feature.bbox.y1 - feature.bbox.y0;
  const buildingShort = Math.max(1, Math.min(bw, bh));
  const out: RoofCandidate[] = [];

  // Rule 3：本体（矩形性）→ 屋根に保持（主屋候補）。
  out.push({ kind: 'roof_keep_candidate', featureRef: 'body', reason: { rule: 'main_body', rectangularity: round3(feature.rectangularity) } });

  // Rule 1：張り出し → 浅く狭ければ除外候補（庇/出窓/ポーチ相当）／大きければ保持候補（下屋相当）。
  feature.protrusions.forEach((t, i) => {
    const shortSide = Math.min(t.depth, t.width);
    const base = { depth: t.depth, width: t.width, ratio: round3(t.ratio) };
    if (shortSide < smallFrac * buildingShort) {
      out.push({ kind: 'roof_exclusion_candidate', featureRef: `protrusion-${i}`, reason: { rule: 'shallow_narrow_protrusion', ...base } });
    } else {
      out.push({ kind: 'roof_keep_candidate', featureRef: `protrusion-${i}`, reason: { rule: 'large_protrusion', ...base } });
    }
  });

  // Rule 2：凹み → 一定以上なら谷候補（小さな凹みはノイズとして候補にしない）。
  feature.notches.forEach((t, i) => {
    const shortSide = Math.min(t.depth, t.width);
    if (shortSide >= valleyFrac * buildingShort) {
      out.push({ kind: 'valley_candidate', featureRef: `notch-${i}`, reason: { rule: 'notch_forms_valley', depth: t.depth, width: t.width, ratio: round3(t.ratio) } });
    }
  });

  return out;
}
