// 甍AI Phase F / F-4 Roof Configuration（Ver0）— RoofModel → RoofConfiguration（Geometry 主導の写像）。
//   ★責務（PHASE-F-ROOF-ANALYZER.md §8.3・責務反転）：Configuration の**生成源は Geometry（RoofModel）**。
//     - shape ← roofType(model)（roofEngine が創発する屋根タイプ）
//     - slope ← 面 pitch（Geometry が保持。F-3 が elevation から割った値が RoofModel を通って来る）
//     - edges ← edgeRoles(model)（roofEngine が創発する辺ロール・EdgeRole→ConfigEdgeRole へ写像）
//   ★Observation（ElevationSpec）は**補正 Evidence だけ**：eave に overhang を付ける。Configuration の生成源にはしない。
//     → slope は Observation の pitch では上書きしない（Geometry の pitch が正）。「Geometry 主導・Observation は補正」。
//   ★既存 LOCK を変更しない：`roofConfig.ts`（RoofConfiguration 契約）・`recognizer.ts`（obs 主導 reconcileRoofConfig）は
//     そのまま。F-4 は `buildRoofConfiguration` を再利用して同じ契約を Geometry から作る新しい純関数（写像層）。
//   ★Ver0 の範囲：単一 RoofUnit（下屋分割・多系統は F-3 が複数面系統を出す Ver1 以降）。
//     方位別（dir）割当・per-dir overhang・pitch 別割当は Ver1（面の下り方位 ↔ ElevationSpec.dir を北矢印基準で結ぶ）。

import type { RoofModel, EdgeRole } from './roofModel';
import type { RoofConfiguration, RoofUnit, EdgeConfig, ConfigEdgeRole, RoofUnitRole } from './roofConfig';
import { buildRoofConfiguration } from './roofConfig';
import { edgeRoles, roofType } from './roofEngine';
import type { ElevationSpec } from './recognizer';

// roofModel EdgeRole → roofConfig ConfigEdgeRole（wall_flashing→flashing・他は 1:1）。
const EDGE_ROLE_MAP: Record<EdgeRole, ConfigEdgeRole> = {
  ridge: 'ridge', hip: 'hip', valley: 'valley', eave: 'eave', gable: 'gable',
  wall_flashing: 'flashing', shed_ridge: 'shed_ridge', grip: 'grip',
};
// edges の決定的な並び（テスト・表示の安定のため）。
const ROLE_ORDER: ConfigEdgeRole[] = ['eave', 'ridge', 'hip', 'valley', 'gable', 'flashing', 'shed_ridge', 'grip'];

export interface RoofConfigOptions {
  id?: string;
  role?: RoofUnitRole;   // 系統上の位置（既定 main）。
  name?: string;
}

// 代表 slope（Ver0＝面 pitch の最小。obs-path と同規則）。★Geometry から取る（Observation ではない）。
function representativeSlope(model: RoofModel): number | undefined {
  const ps = model.faces.map((f) => f.slope.pitch).filter((p): p is number => p != null && p > 0);
  return ps.length ? Math.min(...ps) : undefined;
}

// 代表 overhang（Ver0 補正＝観測 overhang の最小。方位別割当は Ver1）。★Observation の補正 Evidence。
function representativeOverhang(elevation?: ElevationSpec[]): number | undefined {
  const all = (elevation ?? []).flatMap((e) => e.overhangs).filter((o) => o > 0);
  return all.length ? Math.min(...all) : undefined;
}

// RoofModel → RoofConfiguration（F-4 Ver0・Geometry 主導）。
export function configFromRoofModel(model: RoofModel, elevation?: ElevationSpec[], opts: RoofConfigOptions = {}): RoofConfiguration {
  // ── Geometry 主導：shape / slope / edges を RoofModel から導く ──
  const shape = roofType(model);                          // 創発（片流れ/切妻/寄棟…）
  const slope = representativeSlope(model);               // 面 pitch（Geometry）
  const present = new Set<ConfigEdgeRole>();
  for (const r of edgeRoles(model).values()) if (r) present.add(EDGE_ROLE_MAP[r]); // 創発ロールを集約

  // ── Observation は補正だけ：eave に overhang を付ける（生成源にはしない・slope は上書きしない）──
  const overhang = representativeOverhang(elevation);
  const edges: EdgeConfig[] = ROLE_ORDER.filter((r) => present.has(r)).map((role) =>
    role === 'eave' && overhang != null ? { role, overhang } : { role },
  );

  const unit: RoofUnit = {
    id: opts.id ?? 'R1',
    role: opts.role ?? 'main',
    ...(opts.name ? { name: opts.name } : {}),
    ...(shape ? { shape } : {}),
    ...(slope != null ? { slope } : {}),
    edges,
  };
  return buildRoofConfiguration([unit]);
}
