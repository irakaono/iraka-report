/**
 * Engine: calcVentilation()
 * 換気計算 = 天井面積（投影）で計算
 * RULE-004, RULE-005, RULE-200, RULE-201, RULE-202
 */
import { VENT } from './knowledge.js';

export function calcVentilation(roofType, areas) {
  const { ceilingArea = 0, shimoYaCeiling = 0 } = areas;
  const steps = [];
  const result = {};

  // RULE-004: 必ず天井面積（投影）を使う
  steps.push({ step:1, ruleRef:'RULE-004',
    description:'換気計算基準確認: 天井面積（投影面積）を使用',
    note:'屋根実面積（勾配伸び率込み）は絶対に使わない' });

  const isKirituma = roofType?.includes('kirituma');
  const isKata     = roofType?.includes('katanagare');
  const isYose     = roofType?.includes('yosemune');
  const hasShimoya = roofType?.includes('shimoya') || shimoYaCeiling > 0;

  // ── 主屋根換気 ──
  if (isKirituma || isKata) {
    // RULE-005: 片棟 → 棟換気禁止 → 片流れ換気
    // RULE-201: 片流れ換気 1P:17.5㎡ / 2P:35㎡
    const cap = VENT.capacity['片流れ換気'];
    const count_1P = Math.ceil(ceilingArea / cap['1P_m2']);
    const count_2P = Math.ceil(ceilingArea / cap['2P_m2']);
    result.mainVent = { type:'katanagare', ruleRef:'RULE-005,RULE-201',
      count_1P, count_2P, ceilingArea, capacity_1P:cap['1P_m2'], capacity_2P:cap['2P_m2'] };
    steps.push({ step:2, ruleRef:'RULE-005,RULE-201',
      description:`片棟→棟換気禁止→片流れ換気使用`,
      formula:`天井${ceilingArea}㎡÷${cap['1P_m2']}=ceil(${(ceilingArea/cap['1P_m2']).toFixed(2)}) → ${count_1P}本(1P)`,
      alert: count_1P === 0 ? null : null });

  } else if (isYose) {
    // 寄棟: 棟換気 RULE-200
    const cap = VENT.capacity['棟換気'];
    const count_1P = Math.ceil(ceilingArea / cap['1P_m2']);
    const count_2P = Math.ceil(ceilingArea / cap['2P_m2']);
    result.mainVent = { type:'mune', ruleRef:'RULE-200',
      count_1P, count_2P, ceilingArea, capacity_1P:cap['1P_m2'], capacity_2P:cap['2P_m2'] };
    steps.push({ step:2, ruleRef:'RULE-200',
      description:'寄棟→棟換気',
      formula:`天井${ceilingArea}㎡÷${cap['1P_m2']} → ${count_1P}本(1P)` });
  }

  // ── 下屋換気: RULE-202 ──
  if (hasShimoya && shimoYaCeiling > 0) {
    const cap = VENT.capacity['雨押え換気'];
    const count_1P = Math.ceil(shimoYaCeiling / cap['1P_m2']);
    const count_2P = Math.ceil(shimoYaCeiling / cap['2P_m2']);
    result.shimoyaVent = { type:'amaoshi', ruleRef:'RULE-004,RULE-202',
      count_1P, count_2P, shimoYaCeiling,
      capacity_1P: cap['1P_m2'], capacity_2P: cap['2P_m2'] };
    steps.push({ step:3, ruleRef:'RULE-004,RULE-202',
      description:'下屋→雨押え換気（下屋天井面積のみ、2F天井含まない）',
      formula:`下屋天井${shimoYaCeiling}㎡÷${cap['1P_m2']} → ${count_1P}本(1P) / ${count_2P}本(2P)` });
  }

  // ── アラート: 片棟に棟換気 ──
  const alerts = [];
  if ((isKirituma || isKata) && result.mainVent?.type === 'mune') {
    alerts.push({ level:'ERROR', ruleRef:'RULE-005',
      msg:'片棟なのに棟換気が計上されています。片流れ換気(RULE-201)を使用してください。' });
  }

  return { ...result, alerts, reasoning: steps, ruleRef:'RULE-004,RULE-005,RULE-201,RULE-202' };
}
