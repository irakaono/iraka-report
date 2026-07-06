/**
 * Engine: detectRoofType()
 * 立面図の形状情報から屋根タイプを判定する
 * RULE-001, RULE-005
 */

/**
 * @param {object} elevationFlags - 各面の屋根有無・形状
 *   { south:{hasRoof,isGable}, north:{hasRoof,isGable},
 *     east:{hasRoof,isGable},  west:{hasRoof,isGable},
 *     hasShimoya, shimoyaFace }
 * @returns {object} { type, confidence, shimoyaFace, reasoning }
 */
export function detectRoofType(elevationFlags) {
  const { south, north, east, west, hasShimoya, shimoyaFace } = elevationFlags;
  const steps = [];

  // STEP1: 四面の屋根有無を確認
  steps.push({
    step:1, action:'図面読取',
    description:'立面図4面の屋根有無・妻面形状を確認',
    result:`南:${south.hasRoof} 北:${north.hasRoof} 東:${east.hasRoof} 西:${west.hasRoof}`
  });

  // STEP2: 切妻判定（東or西が妻面=三角形 AND 南北両面に屋根）
  // ※片流れでも妻面はgableになるため、南北両面あることを必須条件とする
  const bothSidesHaveRoof = south.hasRoof && north.hasRoof;
  if ((east.isGable || west.isGable) && bothSidesHaveRoof) {
    const conf = (east.isGable && west.isGable) ? 95 : 75;
    steps.push({step:2, action:'判定', ruleRef:'RULE-001',
      description:'東西妻面あり・南北両面に屋根 → 切妻', result:'kirituma'});
    // 下屋あり？
    if (hasShimoya) {
      steps.push({step:3, action:'判定',
        description:`下屋あり（${shimoyaFace}面）→ kirituma_with_shimoya`,
        result:'kirituma_with_shimoya'});
      return { type:'kirituma_with_shimoya', shimoyaFace,
               confidence:conf, ruleRef:'RULE-001', reasoning:steps };
    }
    return { type:'kirituma', confidence:conf, ruleRef:'RULE-001', reasoning:steps };
  }

  // STEP3: 片流れ判定（一方のみ屋根面）
  if (south.hasRoof && !north.hasRoof) {
    steps.push({step:2, action:'判定', ruleRef:'RULE-001',
      description:'南面のみ屋根あり → 片流れ（南向き水下）', result:'katanagare_south'});
    if (hasShimoya) {
      return { type:'katanagare_south_with_shimoya', shimoyaFace,
               confidence:80, ruleRef:'RULE-001', reasoning:steps };
    }
    return { type:'katanagare_south', confidence:85, ruleRef:'RULE-001', reasoning:steps };
  }
  if (north.hasRoof && !south.hasRoof) {
    steps.push({step:2, action:'判定', ruleRef:'RULE-001',
      description:'北面のみ屋根あり → 片流れ（北向き水下）', result:'katanagare_north'});
    if (hasShimoya) {
      return { type:'katanagare_north_with_shimoya', shimoyaFace,
               confidence:80, ruleRef:'RULE-001', reasoning:steps };
    }
    return { type:'katanagare_north', confidence:85, ruleRef:'RULE-001', reasoning:steps };
  }

  // STEP4: 寄棟（四面全てに屋根）
  if (south.hasRoof && north.hasRoof && east.hasRoof && west.hasRoof) {
    steps.push({step:2, action:'判定', ruleRef:'RULE-001',
      description:'四面全てに屋根面あり → 寄棟', result:'yosemune'});
    return { type:'yosemune', confidence:80, ruleRef:'RULE-001', reasoning:steps };
  }

  // 不明
  steps.push({step:2, action:'アラート',
    description:'屋根タイプを自動判定できない → 人確認必要', result:'unknown'});
  return {
    type:'unknown', confidence:0, ruleRef:'RULE-001', reasoning:steps,
    alert:{ level:'WARNING', ruleRef:'RULE-001',
            msg:'屋根タイプが自動判定できません。立面図を確認してください。' }
  };
}
