/**
 * 甍AI積算エンジン Ver.3.0
 * メイン処理: 入力 → Knowledge参照 → 計算 → Evidence生成
 */
import { detectRoofType }   from './detectRoofType.js';
import { calcRoofAreas }    from './calcRoofArea.js';
import { calcLengths }      from './calcLengths.js';
import { calcVentilation }  from './calcVentilation.js';
import { calcDrainage }     from './calcDrainage.js';
import { buildAllEvidence } from './generateEvidence.js';
import { calcAllValleys, getValleyRate } from './calcValley.js';
import { calcAllValleyAssemblies, calcValleyAssembly } from './calcValleyAssembly.js';

/**
 * メイン積算エンジン
 * @param {object} input - 物件情報
 * @param {string} projectId - プロジェクトID
 * @returns {object} 積算結果 + Evidence + アラート
 */
export function IrakaEstimation(input, projectId = 'P_UNKNOWN') {
  const {
    elevationFlags, roofParams, location = 'saitama'
  } = input;

  // STEP1: 屋根タイプ判定
  const roofDet   = detectRoofType(elevationFlags);
  const roofType  = roofDet.type;

  // STEP2: 面積計算
  const areas     = calcRoofAreas(roofParams);

  // STEP3: 長さ計算
  const lengths   = calcLengths({ roofType, ...roofParams });

  // STEP4: 換気計算
  const ventilation = calcVentilation(roofType, areas);

  // STEP5: 排水計算
  const drainage  = calcDrainage(lengths, areas, location);

  // STEP6: Evidence生成
  const evidences = buildAllEvidence(
    { roofType, areas, lengths, ventilation, drainage }, projectId
  );

  // 全アラートを集約
  const allAlerts = [
    ...(roofDet.alert ? [roofDet.alert] : []),
    ...(ventilation.alerts || []),
    ...(drainage.alerts || []),
    ...evidences.flatMap(e => e.alerts || [])
  ];

  return {
    projectId, roofType,
    // ── 積算数量サマリー ──
    summary: {
      roofArea:    areas.totalArea,
      mainArea:    areas.mainArea,
      shimoyaArea: areas.shimoyaArea,
      noki:        lengths.noki,
      keraba:      lengths.keraba,
      katamune:    lengths.katamune,
      mizukami:    lengths.mizukami,
      amaoshi:     lengths.amaoshi,
      fufu:        lengths.fufu,
      yukidome:    lengths.yukidome,
      ventMain:    ventilation.mainVent?.count_1P,
      ventShimoya: ventilation.shimoyaVent?.count_1P,
      gutterCount: drainage.gutterCount,
      tatetoi:     drainage.tatetoi_total,
      pmasuCount:  drainage.pmasuCount,
    },
    // ── 詳細 ──
    areas, lengths, ventilation, drainage,
    // ── Evidence（積算根拠）──
    evidences,
    // ── アラート ──
    alerts: allAlerts,
    // ── メタ ──
    engineVersion: 'Ver.3.0',
    generatedAt: new Date().toISOString()
  };
}

export { detectRoofType, calcRoofAreas, calcLengths, calcVentilation, calcDrainage, buildAllEvidence, calcAllValleys, getValleyRate, calcAllValleyAssemblies, calcValleyAssembly };
