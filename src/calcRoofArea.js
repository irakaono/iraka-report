/**
 * Engine: calcRoofArea()
 * 屋根面積 = 平面投影面積 × 流れ勾配伸び率
 * RULE-001, RULE-100, RULE-003（伸び率を掛けない部材の区別）
 */
import { getSlopeRate } from './knowledge.js';

/**
 * @param {object} roofParams
 *   主屋根: { buildingW, buildingD, noki_S, noki_N, noki_EW, slope_sun }
 *   下屋:   { hasShimoya, shimoyaW, shimoyaDepth, shimoyaNoki, shimoyaSlope }
 */
export function calcRoofAreas(roofParams) {
  const {
    buildingW, buildingD,
    noki_S = 0, noki_N = 0, noki_EW = 0,
    slope_sun,
    hasShimoya = false,
    shimoyaW = 0, shimoyaDepth = 0, shimoyaNoki_S = 0, shimoyaSlope_sun = null
  } = roofParams;

  const slopeRate    = getSlopeRate(slope_sun);
  const shimoyaRate  = shimoyaSlope_sun ? getSlopeRate(shimoyaSlope_sun) : 1.0;
  const steps = [];

  // ── 主屋根投影面積（軒含む） ──
  // RULE-001: 平面図ポリゴン × RULE-100: 伸び率
  const mainW    = buildingW + 2 * noki_EW;   // 桁行（けらば含）
  const mainD    = buildingD + noki_S + noki_N; // 梁間（軒含）
  const mainProj = mainW * mainD;
  const mainArea = mainProj * slopeRate;

  steps.push({
    step:1, action:'計算', ruleRef:'RULE-001,RULE-100',
    description:`主屋根投影面積: ${mainW.toFixed(3)}×${mainD.toFixed(3)}=${mainProj.toFixed(3)}㎡`,
    formula:`(${buildingW}+2×${noki_EW}) × (${buildingD}+${noki_S}+${noki_N}) × ${slopeRate}`,
    result:`${mainArea.toFixed(2)}㎡`
  });

  // ── 下屋投影面積 ──
  let shimoyaProj = 0, shimoyaArea = 0;
  if (hasShimoya && shimoyaW > 0 && shimoyaDepth > 0) {
    shimoyaProj = shimoyaW * (shimoyaDepth + shimoyaNoki_S);
    shimoyaArea = shimoyaProj * shimoyaRate;
    steps.push({
      step:2, action:'計算', ruleRef:'RULE-001,RULE-100',
      description:`下屋投影面積: ${shimoyaW.toFixed(3)}×${(shimoyaDepth+shimoyaNoki_S).toFixed(3)}`,
      formula:`${shimoyaW}×(${shimoyaDepth}+${shimoyaNoki_S}) × ${shimoyaRate}`,
      result:`${shimoyaArea.toFixed(2)}㎡`
    });
  }

  const totalArea = mainArea + shimoyaArea;
  const totalProj = mainProj + shimoyaProj;

  steps.push({
    step:3, action:'合計',
    description:`屋根面積合計`,
    formula:`${mainArea.toFixed(2)} + ${shimoyaArea.toFixed(2)}`,
    result:`${totalArea.toFixed(2)}㎡`
  });

  return {
    mainArea:     +mainArea.toFixed(2),
    shimoyaArea:  +shimoyaArea.toFixed(2),
    totalArea:    +totalArea.toFixed(2),
    mainProj:     +mainProj.toFixed(2),
    shimoyaProj:  +shimoyaProj.toFixed(2),
    totalProj:    +totalProj.toFixed(2),
    slopeRate, shimoyaRate,
    // 天井面積（換気・排水計算用）= 投影面積
    ceilingArea:      +mainProj.toFixed(2),
    shimoYaCeiling:   +shimoyaProj.toFixed(2),
    ruleRef:          'RULE-001,RULE-100',
    reasoning: steps
  };
}
