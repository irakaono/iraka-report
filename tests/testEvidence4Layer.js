/**
 * Evidence 4層構造テスト
 * Observation / Reasoning / Calculation / Evidence
 * + HumanCorrection
 */
import { buildEvidence4Layer, buildAllEvidence, resetSeq } from '../src/generateEvidence.js';

let pass=0, fail=0;
function chk(label, actual, expected) {
  const ok = typeof expected === 'boolean'
    ? Boolean(actual) === expected
    : String(actual) === String(expected);
  if(ok){pass++;console.log(`  ✅ ${label}`);}
  else{fail++;console.log(`  ❌ ${label}: ${JSON.stringify(actual)} (期待:${JSON.stringify(expected)})`);}
}
function has(label, obj, key) {
  chk(label, key in obj && obj[key] !== null, true);
}

console.log('\n═══════════════════════════════════════════════════════');
console.log('  Evidence 4層構造テスト Ver.3.1');
console.log('═══════════════════════════════════════════════════════');

// ── 基本4層構造テスト ──
console.log('\n▶ 4層構造 基本確認（軒先）');
resetSeq();
const ev1 = buildEvidence4Layer({
  itemName: '軒先（桟鼻）',
  value: 19.0, unit: 'm',
  observation: {
    drawingType: '南側立面図', drawingPage: 'p.5',
    face: '南面 水下軒先', raw_value: '19.0m'
  },
  reasoning: {
    why: '軒は立面図実長。勾配伸び率不要。',
    selectedRule: 'RULE-002',
    rejectedRules: [{ rule:'RULE-100（伸び率）', reason:'軒は立面図実長のため' }],
    caseRef: 'Case001', caseNote: '関根邸と同じ片流れ'
  },
  calculation: {
    formula: '立面図実長 19.0m',
    steps: ['立面図で軒先端を確認','水下のみ計測'],
    slopeApplied: false, calcBase: 'elevation_actual',
  },
}, 'P2026-001');

// Layer1: Observation
has('Layer1 drawingType', ev1.observation, 'drawingType');
chk('Observation.face', ev1.observation.face, '南面 水下軒先');
chk('Observation.raw_value', ev1.observation.raw_value, '19.0m');

// Layer2: Reasoning
has('Layer2 why', ev1.reasoning, 'why');
chk('Reasoning.selectedRule', ev1.reasoning.selectedRule, 'RULE-002');
chk('Reasoning.rejectedRules.length', ev1.reasoning.rejectedRules.length, '1');
chk('Reasoning.rejectedRules[0].rule', ev1.reasoning.rejectedRules[0].rule, 'RULE-100（伸び率）');
chk('Reasoning.caseRef', ev1.reasoning.caseRef, 'Case001');

// Layer3: Calculation
chk('Calculation.slopeApplied', ev1.calculation.slopeApplied, 'false');
chk('Calculation.calcBase', ev1.calculation.calcBase, 'elevation_actual');

// Layer4: Evidence
chk('Evidence.id', ev1.id, 'EV-P2026-001-001');
chk('Evidence.value', ev1.value, '19');
chk('Evidence.confidence>=80', ev1.confidence >= 80, true);
chk('calculation.aiValue', ev1.calculation.aiValue, '19');

// ── HumanCorrection テスト ──
console.log('\n▶ HumanCorrection（AIが7.3m → 人が6.9mに修正）');
resetSeq();
const ev2 = buildEvidence4Layer({
  itemName: '雨押え板金',
  value: 7.3,  // AIの算出値
  unit: 'm',
  observation: {
    drawingType: '立面図', face: '2F外壁と下屋取合', raw_value: '7.3m'
  },
  reasoning: {
    why: '雨押えは立面図実長。2F外壁と下屋の取合を全周計上した。',
    selectedRule: 'RULE-003',
    rejectedRules: [],
  },
  calculation: {
    formula: '東西5.46×2 + 北10.47 = 21.39m → 東面のみ7.3m',
    calcBase: 'elevation_actual',
  },
  // 人が修正した
  humanCorrection: {
    aiValue:     7.3,
    humanValue:  6.9,
    reason:      '西側はサイディング納まりのため不要。東面のみ梁間5.46+南突出1.44=6.9m。',
    correctedBy: '小野',
    correctedAt: '2026-07-06',
    approved:    true,
    learnedRule: null,
  },
}, 'P2026-001');

chk('finalValue=6.9（human値が優先）', ev2.value, '6.9');
chk('calculation.aiValue=7.3（AIの計算値は保存）', ev2.calculation.aiValue, '7.3');
chk('HumanCorrection.reason存在', !!ev2.humanCorrection?.reason, true);
chk('HumanCorrection.correctedBy', ev2.humanCorrection.correctedBy, '小野');
chk('HumanCorrection.aiValue', ev2.humanCorrection.aiValue, '7.3');
chk('HumanCorrection.humanValue', ev2.humanCorrection.humanValue, '6.9');
chk('humanRequired=true（修正あり）', ev2.humanRequired, 'true');

console.log(`\n  📋 HumanCorrection全体:`);
console.log(`     AI算出: ${ev2.calculation.aiValue}m`);
console.log(`     人の修正: ${ev2.humanCorrection.humanValue}m`);
console.log(`     理由: ${ev2.humanCorrection.reason}`);
console.log(`     承認: ${ev2.humanCorrection.correctedBy} (${ev2.humanCorrection.correctedAt})`);

// ── buildAllEvidence 4層確認 ──
console.log('\n▶ buildAllEvidence()  全Evidence 4層構造確認');
resetSeq();
const engineResult = {
  roofType: 'katanagare_north',
  areas: {
    totalArea:85.6, mainArea:85.6, shimoyaArea:0,
    totalProj:84.7, mainProj:84.7, shimoyaProj:0,
    ceilingArea:84.7, shimoYaCeiling:0,
    slopeRate:1.011, shimoyaRate:1.0,
  },
  lengths: {
    noki:19.0, keraba:0, katamune:16.6,
    mizukami:16.6, mizukamiRule:'RULE-007', mizukamiConfidence:72,
    amaoshi:0, fufu:35.6, yukidome:19.0,
    tatetoi_height_2F:6.475, tatetoi_height_1F:0,
    reasoning:[]
  },
  ventilation: {
    mainVent:{ type:'katanagare', ruleRef:'RULE-005,RULE-201',
               count_1P:1, ceilingArea:84.7, capacity_1P:17.5 },
    shimoyaVent:null, alerts:[],
  },
  drainage:{
    rainfall:140, capacity_m2:69, gutterCount:2,
    spacing:9.5, nokiTotal:19.0, tatetoi_total:12.95,
    pmasuCount:2, areaPerGutter:42.35, alerts:[],
  },
};
const evList = buildAllEvidence(engineResult, 'P2026-001');
chk('Evidence件数≥5', evList.length >= 5, true);

for (const ev of evList) {
  // 全EVに4層が存在するか
  chk(`${ev.id}(${ev.itemName.slice(0,10)}) observation存在`, !!ev.observation, true);
  chk(`${ev.id} reasoning存在`, !!ev.reasoning, true);
  chk(`${ev.id} calculation存在`, !!ev.calculation, true);
  chk(`${ev.id} value存在`, ev.value !== null && ev.value !== undefined, true);
  chk(`${ev.id} selectedRule存在`, !!ev.reasoning?.selectedRule, true);
}

console.log('\n  Evidence一覧:');
for (const ev of evList) {
  const rule = ev.reasoning?.selectedRule || '?';
  const why  = (ev.reasoning?.why || '').slice(0,40);
  console.log(`  ${ev.id}  [${rule}] ${ev.itemName} = ${ev.value}${ev.unit}  Conf.${ev.confidence}%`);
  console.log(`    Why: ${why}`);
  if (ev.reasoning?.rejectedRules?.length > 0) {
    ev.reasoning.rejectedRules.forEach(r =>
      console.log(`    ✗ 不採用: ${r.rule} → ${r.reason}`));
  }
}

// ── サマリー ──
console.log('\n═══════════════════════════════════════════════════════');
console.log(`  結果: ${pass} PASS / ${fail} FAIL`);
if(fail>0){console.log('  ⛔ RULE-601: テスト失敗');process.exit(1);}
else{console.log('  ✅ 全テスト合格（RULE-601）');process.exit(0);}
