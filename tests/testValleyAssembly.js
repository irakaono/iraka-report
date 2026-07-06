/**
 * RULE-121〜124 Valley Assembly テスト
 * npm test で全Case合格が条件（RULE-601）
 */
import { calcValleyAssembly, calcAllValleyAssemblies } from '../src/calcValleyAssembly.js';

let pass = 0, fail = 0;

function chk(label, actual, expected, tol = 0.01) {
  const ok = typeof expected === 'boolean'
    ? actual === expected
    : Math.abs(Number(actual) - Number(expected)) <= tol;
  if (ok) { pass++; process.stdout.write(`  ✅ ${label}: ${actual}\n`); }
  else    { fail++; process.stdout.write(`  ❌ ${label}: ${actual} (期待:${expected})\n`); }
}

console.log('\n═══════════════════════════════════════════════════════');
console.log('  RULE-121〜124  Valley Assembly テスト');
console.log('═══════════════════════════════════════════════════════');

// ── 小野さんの計算例（4寸・5.19m→3枚）──
console.log('\n▶ 小野さん計算例  5.0m×4寸 → Assembly');
const r1 = calcValleyAssembly({ planLength: 5.0, mainSlope_sun: 4 });
chk('実長',          r1.actualLength,  5.196, 0.01);
chk('有効長',        r1.effectiveLength, 1.9,  0.001);
chk('必要枚数',      r1.pieces,        3);
chk('発注長',        r1.orderLength,   6.0,   0.01);  // 3×2m
chk('ジョイント数',  r1.joints,        2);             // RULE-123
chk('ビス総数',      r1.screwTotal,    72);            // 24×3
chk('シーラー数',    r1.sealerTotal,   2);             // ジョイント2か所
chk('人工',          r1.labor,         5.196*0.07, 0.01);

console.log(`\n  Assembly JSON:`);
console.log(`  assembly : ${r1.assembly}`);
console.log(`  length   : ${r1.actualLength}m  (plan=${r1.planLength}m × rate=${r1.rate})`);
console.log(`  material : ${r1.material}`);
console.log(`  pieces   : ${r1.pieces}枚  orderLength=${r1.orderLength}m`);
console.log(`  joint    : ${r1.joints}か所`);
console.log(`  screw    : ${r1.screwTotal}本`);
console.log(`  sealer   : ${r1.sealerTotal}本`);
console.log(`  labor    : ${r1.labor}人工`);
console.log(`  Conf.    : ${r1.confidence}%`);

// ── 複数勾配（主屋5寸・下屋2寸）──
console.log('\n▶ 複数勾配  主屋5寸 + 下屋2寸 → 大きい方5寸採用（安全側）');
const r2 = calcValleyAssembly({ planLength: 3.5, mainSlope_sun:5, shimoyaSlope_sun:2 });
chk('usedSlope=5寸',       r2.usedSlope,  5);
chk('multiSlope=true',     r2.multiSlope, true);
chk('Confidence<90',       r2.confidence < 90, true);
console.log(`  interimNote: ${r2.interimNote?.slice(0,60)}...`);
console.log(`  futureNote[0]: ${r2.futureNote[0]}`);

// ── 大垣邸タイプ（6本、5寸）──
console.log('\n▶ 大垣邸タイプ  谷6本 5寸勾配 一括Assembly');
const r3 = calcAllValleyAssemblies([
  { id:'V01', planLength:5.2,  label:'谷1' },
  { id:'V02', planLength:5.2,  label:'谷2' },
  { id:'V03', planLength:4.8,  label:'谷3' },
  { id:'V04', planLength:4.8,  label:'谷4' },
  { id:'V05', planLength:3.14, label:'谷5（中庭）' },
  { id:'V06', planLength:3.14, label:'谷6（中庭）' },
], 5);

chk('谷6本カウント',         r3.count, 6);
chk('合計実長>26m',          r3.totals.actualLength > 26, true);
chk('合計ジョイント>6',      r3.totals.joints >= 6,       true);
chk('合計ビス本数>100',      r3.totals.screwTotal > 100,  true);
console.log(`\n  合計: 実長${r3.totals.actualLength}m → ${r3.totals.pieces}枚(${r3.totals.orderLength}m)`);
console.log(`  ジョイント: ${r3.totals.joints}か所  ビス: ${r3.totals.screwTotal}本`);
console.log(`  シーラー: ${r3.totals.sealerTotal}本  人工: ${r3.totals.labor}人工`);

// ── RULE構造確認 ──
console.log('\n▶ RuleRef確認');
chk('RULE-120が含まれる', r1.ruleRefs.includes('RULE-120'), true);
chk('RULE-121が含まれる', r1.ruleRefs.includes('RULE-121'), true);
chk('RULE-122が含まれる', r1.ruleRefs.includes('RULE-122'), true);
chk('RULE-123が含まれる', r1.ruleRefs.includes('RULE-123'), true);
chk('RULE-124が含まれる', r1.ruleRefs.includes('RULE-124'), true);

// ── 将来実装メモ確認 ──
console.log('\n▶ 将来実装メモ（Face×Face）');
chk('futureNote[0]に"Face"が含まれる',
    r1.futureNote[0].includes('Face'), true);
console.log(`  ${r1.futureNote[1]}`);
console.log(`  ${r1.futureNote[2]}`);

// ── 全テストサマリー ──
console.log('\n═══════════════════════════════════════════════════════');
console.log(`  結果: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) { console.log('  ⛔ RULE-601: テスト失敗'); process.exit(1); }
else          { console.log('  ✅ 全テスト合格（RULE-601）'); process.exit(0); }
