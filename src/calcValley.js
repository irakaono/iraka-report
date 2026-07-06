/**
 * Engine: calcValley()
 * 谷板金の実長を計算する
 * RULE-120: 谷Line長さ × 隅棟・谷専用伸び率
 *
 * ⚠ RULE-411: 谷LineのPDF座標はAI推定禁止。
 *   平面Length（谷Lineの長さ）は必ずAnnotationJSONから受け取る。
 */

/**
 * 隅棟・谷専用伸び率を計算する
 * 公式: √(1 + (勾配² ÷ 2))
 * 勾配: 4寸=0.4, 5寸=0.5 として代入
 *
 * @param {number} slope_sun - 勾配（寸）例: 4, 5, 6
 * @returns {number} 伸び率
 */
export function getValleyRate(slope_sun) {
  const s = slope_sun / 10;   // 4寸 → 0.4
  return Math.sqrt(1 + (s * s) / 2);
}

/**
 * 谷板金実長を計算する
 * RULE-120
 *
 * @param {object} params
 *   planLength    - 平面図上の谷Line長さ (m)。AnnotationJSONから受け取る。
 *   mainSlope_sun - 主屋の勾配（寸）
 *   shimoyaSlope_sun - 下屋の勾配（寸）。null なら主屋のみ。
 *
 * @returns {object} { actualLength, rate, usedSlope, reasoning }
 */
export function calcValley(params) {
  const {
    planLength,           // 平面図谷Line長さ (m) ← AnnotationJSONから
    mainSlope_sun,        // 主屋勾配（寸）
    shimoyaSlope_sun = null,  // 下屋勾配（寸）
  } = params;

  const steps = [];

  // STEP1: 座標ソース確認（RULE-411）
  steps.push({
    step: 1, action: '座標確認', ruleRef: 'RULE-411',
    description: '谷Line長さはAnnotationJSONから受け取る。AI推定禁止。',
    result: `planLength = ${planLength}m`
  });

  // STEP2: 使用勾配の決定（RULE-120: 複数勾配は大きい方）
  let usedSlope = mainSlope_sun;
  let multiSlope = false;

  if (shimoyaSlope_sun !== null && shimoyaSlope_sun !== mainSlope_sun) {
    usedSlope = Math.max(mainSlope_sun, shimoyaSlope_sun);
    multiSlope = true;
    steps.push({
      step: 2, action: 'ルール適用', ruleRef: 'RULE-120',
      description: `主屋${mainSlope_sun}寸 ≠ 下屋${shimoyaSlope_sun}寸 → 大きい方${usedSlope}寸を採用（安全側）`,
      result: `usedSlope = ${usedSlope}寸`
    });
  } else {
    steps.push({
      step: 2, action: 'ルール適用', ruleRef: 'RULE-120',
      description: `勾配 ${usedSlope}寸`,
      result: `usedSlope = ${usedSlope}寸`
    });
  }

  // STEP3: 隅棟・谷専用伸び率を計算
  const rate = getValleyRate(usedSlope);
  const s    = usedSlope / 10;
  steps.push({
    step: 3, action: '伸び率計算', ruleRef: 'RULE-120',
    description: `隅棟・谷伸び率 = √(1 + ${s}² ÷ 2) = √${(1 + s*s/2).toFixed(4)}`,
    formula: `√(1 + (${usedSlope}/10)² ÷ 2)`,
    result: `rate = ${rate.toFixed(4)}`
  });

  // STEP4: 実長算出
  const actualLength = +(planLength * rate).toFixed(3);
  steps.push({
    step: 4, action: '実長算出', ruleRef: 'RULE-120',
    description: `谷実長 = ${planLength}m × ${rate.toFixed(4)}`,
    formula: `${planLength} × ${rate.toFixed(4)}`,
    result: `${actualLength}m`
  });

  // NOTE: 将来実装メモ
  const futureNote = multiSlope
    ? '将来実装: 主屋勾配・下屋勾配・谷の向きを保持し、谷専用計算を行う'
    : null;

  return {
    planLength,
    actualLength,
    rate:        +rate.toFixed(4),
    usedSlope,
    multiSlope,
    futureNote,
    ruleRef:     'RULE-120',
    confidence:  multiSlope ? 75 : 90,  // 複数勾配は安全側計算なので確信度下げる
    reasoning:   steps
  };
}

/**
 * 複数の谷Lineをまとめて計算する
 */
export function calcAllValleys(valleyLines, mainSlope_sun, shimoyaSlope_sun = null) {
  const results = valleyLines.map((line, i) => ({
    id:    line.id || `valley-${i+1}`,
    label: line.label || `谷 ${i+1}`,
    ...calcValley({
      planLength:      line.planLength,
      mainSlope_sun,
      shimoyaSlope_sun
    })
  }));

  const totalActual = +results.reduce((sum, r) => sum + r.actualLength, 0).toFixed(3);
  const totalPlan   = +results.reduce((sum, r) => sum + r.planLength,   0).toFixed(3);

  return {
    lines:        results,
    totalActual,
    totalPlan,
    lineCount:    results.length,
    ruleRef:      'RULE-120',
    reasoning: [{
      action:      'まとめ計算',
      description: `谷${results.length}本 合計: 平面${totalPlan}m → 実長${totalActual}m`,
    }]
  };
}
