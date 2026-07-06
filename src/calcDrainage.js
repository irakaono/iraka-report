/**
 * Engine: calcDrainage()
 * 排水計算 = 投影面積で集水器判定
 * RULE-006, RULE-008, RULE-011, RULE-300
 */
import { getDrainageCapacity, DRAIN } from './knowledge.js';

export function calcDrainage(lengths, areas, location = 'saitama') {
  const { noki = 0, tatetoi_height_2F = 0, tatetoi_height_1F = 0 } = lengths;
  const { totalProj = 0 } = areas;
  const steps = [];

  // RULE-300: 降雨強度・許容面積
  const { rainfall, capacity_m2 } = getDrainageCapacity(location);
  steps.push({ step:1, ruleRef:'RULE-300',
    description:`降雨強度確認: ${location} → ${rainfall}mm/h → 1か所${capacity_m2}㎡`,
    makerRef:'panasonic_drainage.json' });

  // RULE-006: 投影面積で判定
  const minByCapacity = Math.ceil(totalProj / capacity_m2);
  steps.push({ step:2, ruleRef:'RULE-006',
    description:`投影面積${totalProj}㎡ ÷ ${capacity_m2}㎡ = ${(totalProj/capacity_m2).toFixed(2)} → 最低${minByCapacity}か所`,
    note:'屋根実面積は使わない（RULE-006）' });

  // RULE-008: 建物の角に配置（基本ルール）
  // 軒先2か所以上を基本として、能力計算と大きい方を採用
  const cornerCount = 2;  // 基本:角2か所。実際は物件ごと
  const gutterCount = Math.max(minByCapacity, cornerCount);
  steps.push({ step:3, ruleRef:'RULE-008',
    description:`建物角配置基本ルール: min(${minByCapacity}, ${cornerCount}) → ${gutterCount}か所`,
    note:'最終本数は人が確認する' });

  // 竪樋間隔チェック（RULE-300: 20m以内）
  const spacing = noki / gutterCount;
  const alerts = [];
  if (spacing > 20) {
    alerts.push({ level:'WARNING', ruleRef:'RULE-300',
      msg:`竪樋間隔${spacing.toFixed(1)}m > 20m超過。集水器追加を検討してください。` });
  }
  steps.push({ step:4, ruleRef:'RULE-300',
    description:`竪樋間隔: ${noki.toFixed(2)}m ÷ ${gutterCount} = ${spacing.toFixed(2)}m`,
    result: spacing <= 20 ? `✅ ${spacing.toFixed(2)}m ≤ 20m` : `⚠ ${spacing.toFixed(2)}m > 20m超過` });

  // RULE-011: たてとい実長（ロスなし）
  const tatetoi_2F = +(tatetoi_height_2F * gutterCount).toFixed(2);
  const tatetoi_1F_add = tatetoi_height_1F > 0 ? +(tatetoi_height_1F * Math.max(0, gutterCount - 2)).toFixed(2) : 0;
  const tatetoi_total  = +(tatetoi_2F + tatetoi_1F_add).toFixed(2);
  steps.push({ step:5, ruleRef:'RULE-011',
    description:`たてとい実長: ${tatetoi_height_2F}m × ${gutterCount}本 = ${tatetoi_2F}m`,
    note:'ロスなし計上（RULE-011）' });

  return {
    rainfall, capacity_m2,
    gutterCount,
    spacing: +spacing.toFixed(2),
    nokiTotal: noki,
    tatetoi_total,
    pmasuCount: gutterCount,
    areaPerGutter: +(totalProj / gutterCount).toFixed(2),
    alerts,
    reasoning: steps,
    ruleRef: 'RULE-006,RULE-008,RULE-011,RULE-300'
  };
}
