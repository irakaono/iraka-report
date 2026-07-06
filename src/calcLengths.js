/**
 * Engine: calcLengths()
 * 各部材の長さを立面図実長で計算
 * RULE-002, RULE-003, RULE-007, RULE-010, RULE-900, RULE-901
 */

export function calcLengths(params) {
  const {
    roofType,
    buildingW, buildingD,
    noki_S = 0, noki_N = 0, noki_EW = 0,
    // 下屋寸法
    hasShimoya = false,
    shimoyaW = 0, shimoyaDepth = 0, shimoyaNoki_S = 0, shimoyaNoki_EW = 0,
    // 高さ
    height_2F = 0, height_1F = 0,
    floors = 2
  } = params;

  const steps = [];
  const result = {};

  // ── 軒先（水下）: RULE-002 立面図実長 ──
  const isKirituma = roofType?.includes('kirituma');
  const isKata     = roofType?.includes('katanagare');

  // 桁行方向の軒先（けらば含む）
  const mainNokiLine = buildingW + 2 * noki_EW;

  if (isKirituma) {
    // 切妻: 南北2面に軒先
    result.noki = +(mainNokiLine * 2).toFixed(3);
    steps.push({ step:1, ruleRef:'RULE-002',
      description:'切妻: 南北2面の軒先',
      formula:`(${buildingW}+2×${noki_EW})×2 = ${result.noki}m` });
    if (hasShimoya) {
      const shimoyaNoki = shimoyaW + 2 * shimoyaNoki_EW;
      result.noki = +(result.noki + shimoyaNoki).toFixed(3);
      steps.push({ step:2, ruleRef:'RULE-002',
        description:`下屋軒先追加: ${shimoyaNoki.toFixed(3)}m`,
        formula:`${result.noki}m` });
    }
  } else if (isKata) {
    // 片流れ: 水下1面（下屋含む場合は統合）
    // Case005(福堀邸): 2F+1F南を一体で計上
    result.noki = +mainNokiLine.toFixed(3);
    steps.push({ step:1, ruleRef:'RULE-002',
      description:'片流れ: 水下軒先1面',
      formula:`${buildingW}+2×${noki_EW} = ${result.noki}m` });
    if (hasShimoya) {
      const shimoyaNoki = shimoyaW + 2 * shimoyaNoki_EW;
      result.noki = +(result.noki + shimoyaNoki).toFixed(3);
      steps.push({ step:2, ruleRef:'RULE-002',
        description:`下屋軒先統合（Case005パターン）: +${shimoyaNoki.toFixed(3)}m`,
        formula:`${result.noki}m` });
    }
  }

  // ── ケラバ（東西妻面）: RULE-002,RULE-003 勾配伸び率不要 ──
  if (isKirituma) {
    // 切妻: 東西に妻面（梁間方向の斜面 = 投影長さが実長）
    const kerabaOne = buildingD + noki_S + noki_N;
    result.keraba = +(kerabaOne * 2 * 2).toFixed(3); // 東西×両斜面
    steps.push({ step:3, ruleRef:'RULE-002,RULE-003',
      description:'切妻: 東西けらば（勾配伸び率不要）',
      formula:`(${buildingD}+${noki_S}+${noki_N})×2×2 = ${result.keraba}m`,
      note:'立面図実長。伸び率禁止(RULE-003)' });
    if (hasShimoya) {
      const sk = (shimoyaDepth + shimoyaNoki_S) * 2;
      result.keraba = +(result.keraba + sk).toFixed(3);
      steps.push({ step:4, ruleRef:'RULE-003',
        description:`下屋けらば: +${sk.toFixed(3)}m`, formula:`${result.keraba}m` });
    }
  } else {
    result.keraba = 0;
  }

  // ── 片棟（水上端）: RULE-002,RULE-003,RULE-005 棟換気対象外 ──
  result.katamune = +mainNokiLine.toFixed(3); // 桁行（けらば含む）
  steps.push({ step:5, ruleRef:'RULE-002,RULE-003,RULE-005',
    description:'片棟（水上端）= 桁行けらば含む。棟換気対象外',
    formula:`${result.katamune}m` });

  // ── 棟（切妻中央）: RULE-002 ──
  result.mune = isKirituma ? +(buildingW).toFixed(3) : 0;

  // ── 雨押え板金: RULE-003 勾配伸び率不要 ──
  // 2F外壁と下屋の取合（東西+北面）
  if (hasShimoya) {
    const amaoshi_EW = buildingD * 2;
    const amaoshi_N  = buildingW;
    result.amaoshi = +(amaoshi_EW + amaoshi_N).toFixed(3);
    steps.push({ step:6, ruleRef:'RULE-003',
      description:`雨押え板金: 東西${amaoshi_EW.toFixed(3)}m + 北${amaoshi_N.toFixed(3)}m`,
      formula:`${buildingD}×2 + ${buildingW} = ${result.amaoshi}m`,
      note:'立面図実長。伸び率禁止(RULE-003)' });
  } else {
    result.amaoshi = 0;
  }

  // ── 水上立ち上がり: RULE-003,RULE-007 ──
  // タイプ別判定（これが最も物件依存する部分）
  let mizukamiConf = 90;
  if (isKirituma && hasShimoya) {
    // RULE-900: 切妻+下屋 → 全周4面
    const mz_N  = buildingW;
    const mz_S  = shimoyaW > 0 ? shimoyaW : buildingW;
    const mz_EW = (buildingD + (shimoyaDepth || 0)) * 2;
    result.mizukami = +(mz_N + mz_S + mz_EW).toFixed(3);
    result.mizukamiRule = 'RULE-900';
    steps.push({ step:7, ruleRef:'RULE-007,RULE-900',
      description:'切妻+下屋: 全周4面計上（Case004天沼邸パターン）',
      formula:`北${mz_N} + 南${mz_S.toFixed(3)} + 東西${mz_EW.toFixed(3)} = ${result.mizukami}m`,
      caseRef:'Case004' });
    mizukamiConf = 85;
  } else if (isKata && hasShimoya) {
    // RULE-901: 片流れ+下屋 → 東面1か所（Case005福堀邸パターン）
    const mz_east = buildingD + (shimoyaDepth || 0);
    result.mizukami = +mz_east.toFixed(3);
    result.mizukamiRule = 'RULE-901';
    steps.push({ step:7, ruleRef:'RULE-007,RULE-901',
      description:'片流れ+下屋: 東面1か所（Case005福堀邸パターン）',
      formula:`梁間${buildingD} + 下屋${shimoyaDepth || 0} = ${result.mizukami}m`,
      caseRef:'Case005',
      uncertainty:'片流れは物件ごとに確認が必要（RULE-007）' });
    mizukamiConf = 60;
  } else if (isKata) {
    // 片流れ（下屋なし）: 片棟=水上端
    result.mizukami = result.katamune;
    result.mizukamiRule = 'RULE-007';
    steps.push({ step:7, ruleRef:'RULE-007',
      description:'片流れ（下屋なし）: 水上端=片棟長さ',
      formula:`${result.mizukami}m` });
    mizukamiConf = 75;
  } else {
    result.mizukami = 0;
    result.mizukamiRule = 'RULE-007';
    mizukamiConf = 40;
  }
  result.mizukamiConfidence = mizukamiConf;

  // ── 破風板金: RULE-010 鼻隠し+ケラバ+片棟統合 ──
  result.fufu = +(result.noki + (result.keraba || 0) + result.katamune).toFixed(3);
  steps.push({ step:8, ruleRef:'RULE-010',
    description:'破風板金: 鼻隠し+ケラバ+片棟 統合計上（甍標準）',
    formula:`鼻隠し${result.noki} + ケラバ${result.keraba||0} + 片棟${result.katamune} = ${result.fufu}m`,
    caseRef:'Case004,Case005' });

  // ── 雪止め: RULE-002 軒先（水下のみ）──
  result.yukidome = result.noki;

  // ── たてとい本数・長さ: RULE-011 実長のみ ──
  const gutterCount = result._gutterCount || 2; // calcDrainageで後から設定
  result.tatetoi_height_2F = height_2F;
  result.tatetoi_height_1F = height_1F;

  return {
    ...result,
    reasoning: steps,
    ruleRef: 'RULE-002,RULE-003,RULE-007,RULE-010'
  };
}
