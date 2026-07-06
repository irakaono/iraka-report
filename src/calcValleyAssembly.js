/**
 * Engine: calcValleyAssembly()
 * Valley Assembly — 谷板金・副資材・人工を一括生成する
 * RULE-121, RULE-122, RULE-123, RULE-124
 *
 * 設計思想（将来実装への橋渡し）:
 *   現在: Line(実長) → Assembly
 *   将来: Face × Face → Line → Assembly
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { calcValley } from './calcValley.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const K_BASE = join(__dir, '../../iraka_knowledge');

// Knowledge から材料スペックを取得（RULE-122）
function loadMaterialSpec(materialKey = 'galvalume_standard') {
  const data = JSON.parse(
    readFileSync(join(K_BASE, 'makers/valley_materials.json'), 'utf8')
  );
  return data.materials.find(m => m.key === materialKey)
      || data.materials.find(m => m.key === data.defaultKey);
}

/**
 * Valley Assembly を生成する
 * RULE-121〜124
 *
 * @param {object} params
 *   planLength       - 平面図谷Line長さ (m) ← AnnotationJSONから
 *   mainSlope_sun    - 主屋勾配（寸）
 *   shimoyaSlope_sun - 下屋勾配（寸）。null=主屋のみ
 *   materialKey      - 材料キー（省略時: galvalume_standard）
 *   annotationId     - 元のAnnotation ID（トレーサビリティ）
 *
 * @returns {VValleyAssembly}
 */
export function calcValleyAssembly(params) {
  const {
    planLength,
    mainSlope_sun,
    shimoyaSlope_sun   = null,
    materialKey        = 'galvalume_standard',
    annotationId       = null,
  } = params;

  const steps = [];

  // ── STEP1: 谷実長の計算（RULE-120） ──
  const valleyResult = calcValley({ planLength, mainSlope_sun, shimoyaSlope_sun });
  const actualLength = valleyResult.actualLength;
  steps.push({
    step: 1, ruleRef: 'RULE-120',
    description: `谷実長 = ${planLength}m × ${valleyResult.rate} = ${actualLength}m`,
    result: `actualLength = ${actualLength}m`,
    confidence: valleyResult.confidence
  });

  // ── STEP2: 材料スペック取得（RULE-122） ──
  const spec = loadMaterialSpec(materialKey);
  const effectiveLength = spec.effectiveLength_mm / 1000;  // mm→m
  steps.push({
    step: 2, ruleRef: 'RULE-122',
    description: `材料: ${spec.name}  定尺${spec.nominalLength_mm}mm 重ね${spec.overlap_mm}mm 有効${spec.effectiveLength_mm}mm`,
    result: `effectiveLength = ${effectiveLength}m`,
    knowledgeRef: 'makers/valley_materials.json'
  });

  // ── STEP3: 必要枚数・発注長（RULE-121） ──
  const pieces      = Math.ceil(actualLength / effectiveLength);
  const orderLength = +(pieces * (spec.nominalLength_mm / 1000)).toFixed(2);
  steps.push({
    step: 3, ruleRef: 'RULE-121',
    description: `必要枚数 = ceil(${actualLength} ÷ ${effectiveLength}) = ceil(${(actualLength/effectiveLength).toFixed(3)}) = ${pieces}枚`,
    formula: `ceil(${actualLength} ÷ ${effectiveLength})`,
    result: `pieces = ${pieces}枚  発注長 = ${orderLength}m`
  });

  // ── STEP4: ジョイント・副資材（RULE-123） ──
  const joints       = pieces - 1;
  const screwTotal   = pieces * spec.screw_per_piece;
  const sealerTotal  = joints * spec.sealer_per_joint;
  steps.push({
    step: 4, ruleRef: 'RULE-123',
    description: `ジョイント = ${pieces}-1 = ${joints}か所  ビス = ${pieces}×${spec.screw_per_piece} = ${screwTotal}本  シーラー = ${sealerTotal}本`,
    result: `joints=${joints}  screws=${screwTotal}  sealer=${sealerTotal}`
  });

  // ── STEP5: 人工（RULE-124） ──
  const labor = +(actualLength * spec.labor_per_m).toFixed(3);
  steps.push({
    step: 5, ruleRef: 'RULE-124',
    description: `人工 = ${actualLength}m × ${spec.labor_per_m}人工/m = ${labor}人工`,
    result: `labor = ${labor}人工`
  });

  // ── 暫定仕様フラグ（将来実装への明記）──
  const interimNote = valleyResult.multiSlope
    ? `【暫定】複数勾配（主屋${mainSlope_sun}寸/下屋${shimoyaSlope_sun}寸）のため大きい方${valleyResult.usedSlope}寸で安全側計算。将来: Face×FaceからのLine生成へ移行。`
    : null;

  // ── Confidence ──
  // 複数勾配の場合・実長が定尺ちょうどに近い場合は下げる
  let confidence = valleyResult.confidence;
  if (Math.abs(actualLength % effectiveLength) < 0.05) confidence -= 5; // ほぼぴったりはラッキー
  confidence = Math.max(60, confidence);

  return {
    // ── メタ ──
    assembly:       'Valley',
    annotationId,
    ruleRefs:       ['RULE-120','RULE-121','RULE-122','RULE-123','RULE-124'],

    // ── 計算値 ──
    planLength,
    actualLength,
    rate:           valleyResult.rate,
    usedSlope:      valleyResult.usedSlope,
    multiSlope:     valleyResult.multiSlope,

    // ── 材料 ──
    material:       spec.name,
    materialKey,
    nominalLength:  spec.nominalLength_mm / 1000,
    overlap:        spec.overlap_mm / 1000,
    effectiveLength,
    pieces,
    orderLength,

    // ── 副資材 ──
    joints,
    screwTotal,
    sealerTotal,

    // ── 人工 ──
    labor,
    laborUnit:      spec.labor_per_m,

    // ── Evidence ──
    confidence,
    interimNote,
    reasoning:      steps,

    // ── 将来実装メモ ──
    futureNote: [
      '将来 v1: 谷LineをFace×Faceから生成する',
      '将来 v2: FaceAとFaceBそれぞれの勾配から谷専用実長を計算する',
      '将来 v3: RoofGraphからEdge(Valley)を自動抽出してAssemblyを生成する',
    ]
  };
}

/**
 * 複数の谷をまとめて Assembly 生成
 */
export function calcAllValleyAssemblies(valleyLines, mainSlope_sun,
    shimoyaSlope_sun = null, materialKey = 'galvalume_standard') {

  const assemblies = valleyLines.map(line =>
    calcValleyAssembly({
      planLength:       line.planLength,
      mainSlope_sun,
      shimoyaSlope_sun,
      materialKey,
      annotationId:     line.id || null,
    })
  );

  // 集計
  const totals = assemblies.reduce((acc, a) => ({
    actualLength: +(acc.actualLength + a.actualLength).toFixed(3),
    orderLength:  +(acc.orderLength  + a.orderLength ).toFixed(2),
    pieces:       acc.pieces       + a.pieces,
    joints:       acc.joints       + a.joints,
    screwTotal:   acc.screwTotal   + a.screwTotal,
    sealerTotal:  acc.sealerTotal  + a.sealerTotal,
    labor:        +(acc.labor      + a.labor      ).toFixed(3),
  }), { actualLength:0, orderLength:0, pieces:0, joints:0, screwTotal:0, sealerTotal:0, labor:0 });

  return { assemblies, totals, count: assemblies.length };
}
