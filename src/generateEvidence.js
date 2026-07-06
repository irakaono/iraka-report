/**
 * 甍AI積算エンジン — Evidence生成エンジン Ver.3.1
 *
 * Evidence 4層構造:
 *   Observation  → 図面の何を見たか・どの面の部材か
 *   Reasoning    → なぜそのRuleを選んだか（selectedRule / rejectedRules）
 *   Calculation  → 数値計算
 *   Evidence     → 確定値・確信度・人確認
 *
 * HumanCorrection:
 *   AI値と人の修正値を両方保存し、修正理由・承認者まで記録する
 *   → 人の判断が会社の知識になる
 *
 * Reasoning Tree:
 *   将来の複数AI比較に備え、推論プロセスを構造化して保存する
 */

// ── Confidence計算 ──
function calcConfidence(obs, reasoning, caseRef, hasUncertainty) {
  let score = 50;
  if (obs?.drawingType)                         score += 10; // 図面種別が明確
  if (reasoning?.selectedRule)                  score += 15; // RuleIDが確定
  if (reasoning?.rejectedRules?.length > 0)     score += 10; // 不採用Ruleも検討した
  if (caseRef)                                  score += 10; // 過去案件参照あり
  if (hasUncertainty)                           score -= 25; // 不確実性あり
  return Math.min(99, Math.max(1, score));
}

let _seq = 1;
export function resetSeq() { _seq = 1; }

/**
 * buildEvidence4Layer()
 * Evidence 4層構造を生成する
 *
 * @param {object} p - パラメータ
 * @param {string} projectId
 */
export function buildEvidence4Layer(p, projectId = 'P_UNKNOWN') {
  const {
    itemName, value, unit,

    // ── Layer1: Observation ──
    observation = {},
    // {
    //   drawingType: '南側立面図',   // 参照した図面
    //   drawingPage: 'p.5',
    //   face:        '南面 水下軒',  // どの面・部位を見たか
    //   raw_value:   '19.0m',        // 図面上の実測値
    // }

    // ── Layer2: Reasoning ──
    reasoning = {},
    // {
    //   why:           '軒は立面図実長で拾う部材。勾配伸び率は不要。',
    //   selectedRule:  'RULE-002',
    //   rejectedRules: [{rule:'RULE-100', reason:'面積計算用。長さには不要。'}],
    //   caseRef:       'Case001',   // 参照した過去案件
    //   caseNote:      '関根邸と同じ片流れ構造',
    // }

    // ── Layer3: Calculation ──
    calculation = {},
    // {
    //   formula:    '立面図実長',
    //   steps:      ['南立面で軒先を計測', '19.0m 読取'],
    //   slopeApplied: false,
    //   slopeRate:  null,
    //   calcBase:   'elevation_actual',
    // }

    // ── 人確認 ──
    confirmedBy  = null,
    confirmedAt  = null,

    // ── HumanCorrection ──
    humanCorrection = null,
    // {
    //   aiValue:     7.3,
    //   humanValue:  6.9,
    //   reason:      '西側はサイディング納まりのため不要',
    //   correctedBy: '小野',
    //   correctedAt: '2026-07-06',
    //   approved:    true,
    //   learnedRule: null,  // 将来: この修正を新RuleにするID
    // }

    alerts = [],
  } = p;

  const id    = `EV-${projectId}-${String(_seq++).padStart(3,'0')}`;
  const hasUncertainty = alerts.some(a => a.level === 'WARNING' || a.level === 'ERROR');
  const conf  = calcConfidence(observation, reasoning, reasoning?.caseRef, hasUncertainty);
  const humanRequired = conf < 70 || hasUncertainty || !!humanCorrection;

  // 最終値: 人が修正していればhuman値、なければAI値
  const finalValue = humanCorrection
    ? humanCorrection.humanValue
    : value;

  return {
    id,
    projectId,
    itemName,
    version: 'Ver.3.1',

    // ── Layer1: Observation ──
    observation: {
      drawingType: observation.drawingType || null,
      drawingPage: observation.drawingPage || null,
      face:        observation.face        || null,
      raw_value:   observation.raw_value   || null,
    },

    // ── Layer2: Reasoning ──
    reasoning: {
      why:           reasoning.why          || null,
      selectedRule:  reasoning.selectedRule || null,
      rejectedRules: reasoning.rejectedRules|| [],
      caseRef:       reasoning.caseRef      || null,
      caseNote:      reasoning.caseNote     || null,
    },

    // ── Layer3: Calculation ──
    calculation: {
      formula:      calculation.formula      || null,
      steps:        calculation.steps        || [],
      slopeApplied: calculation.slopeApplied || false,
      slopeRate:    calculation.slopeRate    || null,
      calcBase:     calculation.calcBase     || null,
      aiValue:      value,    // AIが計算した値（修正前も保存）
    },

    // ── Layer4: Evidence（確定値）──
    value:         finalValue,
    unit,
    confidence:    conf,
    humanRequired,
    confirmedBy,
    confirmedAt,
    alerts,

    // ── HumanCorrection（人の判断が会社の知識になる）──
    humanCorrection: humanCorrection || null,

    createdAt: new Date().toISOString().slice(0,10),
  };
}

/**
 * buildAllEvidence()
 * Engine結果から全Evidenceを4層構造で一括生成
 */
export function buildAllEvidence(engineResults, projectId) {
  resetSeq();
  const { roofType, areas, lengths, ventilation, drainage } = engineResults;
  const evList = [];
  const isKata = roofType?.includes('katanagare');

  // ── 屋根面積 ──
  evList.push(buildEvidence4Layer({
    itemName: '屋根面積（合計）',
    value: areas.totalArea, unit: '㎡',
    observation: {
      drawingType: '平面図（ポリゴン入力）',
      drawingPage: 'p.3',
      face: '屋根投影面（軒含む）',
      raw_value: `投影${areas.totalProj}㎡`,
    },
    reasoning: {
      why: '屋根面積は平面図ポリゴン × 勾配伸び率で算出する。立面図からの面積計算は禁止。',
      selectedRule: 'RULE-001',
      rejectedRules: [
        { rule: 'RULE-100のみ', reason: '伸び率は必要だが面積取得は平面図から' },
      ],
      caseRef: 'Case001',
      caseNote: '関根邸と同じ片流れ構造',
    },
    calculation: {
      formula: `投影${areas.totalProj}㎡ × 伸び率${areas.slopeRate}`,
      steps: ['平面図ポリゴンで投影面積取得', `伸び率${areas.slopeRate}を掛ける`],
      slopeApplied: true, slopeRate: areas.slopeRate,
      calcBase: 'projection_area',
    },
  }, projectId));

  // ── 軒先（桟鼻・雪止め）──
  evList.push(buildEvidence4Layer({
    itemName: '軒先（桟鼻・捨唐草60・雪止め）',
    value: lengths.noki, unit: 'm',
    observation: {
      drawingType: '南側立面図',
      drawingPage: 'p.5',
      face: isKata ? '南面 水下軒先' : '南北両面 水下軒先',
      raw_value: `${lengths.noki}m`,
    },
    reasoning: {
      why: '軒は立面図実長で拾う部材。勾配伸び率は不要（立面図で見えている長さ=実長のため）。',
      selectedRule: 'RULE-002',
      rejectedRules: [
        { rule: 'RULE-100（伸び率）', reason: '軒は立面図実長。伸び率を掛けると実際より長くなる。' },
      ],
    },
    calculation: {
      formula: '立面図実長',
      steps: ['立面図で軒先端を確認', '水下軒先のみ計測（水上は含めない）'],
      slopeApplied: false, calcBase: 'elevation_actual',
    },
  }, projectId));

  // ── 水上立ち上がり ──
  if (lengths.mizukami > 0) {
    const isRule900 = lengths.mizukamiRule === 'RULE-900';
    const isRule901 = lengths.mizukamiRule === 'RULE-901';
    evList.push(buildEvidence4Layer({
      itemName: '水上立ち上がり',
      value: lengths.mizukami, unit: 'm',
      observation: {
        drawingType: '立面図4面',
        drawingPage: 'p.5',
        face: isRule900 ? '下屋全周4面' : isRule901 ? '東面のみ' : '水上端部',
        raw_value: `${lengths.mizukami}m`,
      },
      reasoning: {
        why: isRule900
          ? '切妻+下屋 → 下屋全周4面で計上（天沼邸で確定）。棟2面分=水上2面分の考え方。'
          : isRule901
          ? '片流れ+下屋 → 東面1か所のみ（福堀邸で確定）。天沼邸の全周ルールは非適用。'
          : '水上は屋根タイプで判定する。AIは仮計上のみ。',
        selectedRule: lengths.mizukamiRule || 'RULE-007',
        rejectedRules: isRule900
          ? [{ rule: 'RULE-901（東面のみ）', reason: '切妻建物のため全周が正解' }]
          : isRule901
          ? [{ rule: 'RULE-900（全周）', reason: '片流れ建物のため東面1か所のみ' }]
          : [],
        caseRef: isRule900 ? 'Case004' : isRule901 ? 'Case005' : null,
      },
      calculation: {
        formula: '立面図実長 勾配伸び率不要',
        slopeApplied: false, calcBase: 'elevation_actual',
      },
      alerts: lengths.mizukamiConfidence < 70
        ? [{ level:'CAUTION', ruleRef:'RULE-007', msg:'水上範囲は物件ごとに確認が必要' }]
        : [],
    }, projectId));
  }

  // ── 換気 ──
  if (ventilation?.mainVent) {
    const mv = ventilation.mainVent;
    evList.push(buildEvidence4Layer({
      itemName: '換気本数（主屋根）',
      value: mv.count_1P, unit: '本',
      observation: {
        drawingType: '平面図（天井投影面積）',
        face: '主屋根天井面積',
        raw_value: `天井${mv.ceilingArea}㎡`,
      },
      reasoning: {
        why: '換気計算は天井面積（投影面積）で行う。屋根実面積（勾配伸び率込み）は使わない。換気は空気が流れる空間の体積に基づくため。',
        selectedRule: mv.ruleRef?.split(',')[0] || 'RULE-201',
        rejectedRules: [
          { rule: 'RULE-100（屋根実面積）', reason: '換気は天井面積。勾配伸び率込みは不正解。' },
        ],
      },
      calculation: {
        formula: `ceil(${mv.ceilingArea} ÷ ${mv.capacity_1P}) = ${mv.count_1P}本`,
        steps: ['天井面積を取得（投影面積=天井面積）', `対応面積${mv.capacity_1P}㎡で除算・切り上げ`],
        slopeApplied: false, calcBase: 'ceiling_area',
      },
    }, projectId));
  }

  // ── 集水器 ──
  evList.push(buildEvidence4Layer({
    itemName: '集水器 F型',
    value: drainage.gutterCount, unit: 'か所',
    observation: {
      drawingType: '平面図 + 立面図',
      face: '建物角（RULE-008: 集水器は角に設置）',
      raw_value: `投影${areas.totalProj}㎡`,
    },
    reasoning: {
      why: '集水器は投影面積（天井面積）で負担を判定する。屋根実面積は使わない。建物の角に設置するのが甍さんの施工標準。',
      selectedRule: 'RULE-006',
      rejectedRules: [
        { rule: '屋根実面積での判定', reason: 'GLへの水量は投影面積が基準。実面積は不正解。' },
      ],
    },
    calculation: {
      formula: `投影${areas.totalProj}㎡ ÷ ${drainage.capacity_m2}㎡ = ceil(${(areas.totalProj/drainage.capacity_m2).toFixed(2)}) → ${drainage.gutterCount}か所`,
      steps: [
        `降雨強度${drainage.rainfall}mm/h（埼玉県）`,
        `NF-I+瞬水S15 → 許容${drainage.capacity_m2}㎡`,
        `投影${areas.totalProj}㎡ ÷ ${drainage.capacity_m2} = ${(areas.totalProj/drainage.capacity_m2).toFixed(2)}`,
        `建物角配置：${drainage.gutterCount}か所`,
      ],
      calcBase: 'projection_area',
    },
    alerts: drainage.alerts || [],
  }, projectId));

  // ── たてとい ──
  evList.push(buildEvidence4Layer({
    itemName: 'たてとい',
    value: drainage.tatetoi_total, unit: 'm',
    observation: {
      drawingType: '立面図',
      face: '建物角 竪樋経路',
      raw_value: `軒高${lengths.tatetoi_height_2F}m × ${drainage.gutterCount}本`,
    },
    reasoning: {
      why: 'たてといは実長のみ計上する（RULE-011）。エルボ・ロス率は含めない。甍さんの計上方法として確立済み。',
      selectedRule: 'RULE-011',
      rejectedRules: [
        { rule: 'ロス込み計上', reason: '甍さんは実長のみ。ロスを含めると過大計上になる。' },
      ],
      caseRef: 'Case001',
      caseNote: 'たてとい実長計上は全物件共通',
    },
    calculation: {
      formula: `${lengths.tatetoi_height_2F}m × ${drainage.gutterCount}本 = ${drainage.tatetoi_total}m`,
      slopeApplied: false, calcBase: 'elevation_actual',
    },
  }, projectId));

  return evList;
}
