// 甍AI Roof Quantity Engine 自己テスト — Evidence First な数量（STEP1）。
//   切妻(pitch5, scale50, 各面 400×300px) で 面積・棟/軒/ケラバ の実量＋根拠を式で固定。
import { buildRoofModelFromFaces } from '../src/geometry/roofModel';
import { roofType } from '../src/geometry/roofEngine';
import { roofQuantities, evidenceOf, toExportValues } from '../src/geometry/roofQuantities';
import { stretch } from '../src/geometry/stretch';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };
const close = (a: number, b: number, t = 1e-6) => Math.abs(a - b) <= t;
const attrs = { trade: '屋根工事', item: '横暖S 本体' };

const model = buildRoofModelFromFaces([
  { vertices: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }], pitch: 5, attrs, eaveEdgeIndex: 0 },
  { vertices: [{ x: 0, y: 300 }, { x: 400, y: 300 }, { x: 400, y: 600 }, { x: 0, y: 600 }], pitch: 5, attrs, eaveEdgeIndex: 2 },
], { scale: 50 });
const scale = 50;
const q = roofQuantities(model, scale);
const get = (k: string) => q.find((x) => x.key === k);

// roofType
ok(roofType(model) === 'gable', `roofType=gable（実 ${roofType(model)}）`);

// 実屋根面積 = 2面 × (400×300/2500=48㎡) × stretch.area(5) = 96 × 1.118034 = 107.331
const area = get('roofArea')!;
const expArea = 96 * stretch.area(5);
ok(!!area && close(area.value, expArea), `実面積=${expArea.toFixed(3)}㎡（実 ${area?.value.toFixed(3)}）`);
ok(area.unit === '㎡' && area.evidence.length === 2, '面積の根拠=2面');
ok(close(area.evidence.reduce((s, e) => s + e.contribution, 0), area.value), '面積: 根拠の合計=value（証拠整合）');

// 棟長 = 共有辺 400px/50=8m ×1 = 8m、根拠=1辺
const ridge = get('ridgeLength')!;
ok(!!ridge && close(ridge.value, 8) && ridge.evidence.length === 1, `棟長=8m/根拠1辺（実 ${ridge?.value}）`);

// 軒長 = 2辺 ×(400/50=8m) = 16m、根拠=2辺
const eave = get('eaveLength')!;
ok(!!eave && close(eave.value, 16) && eave.evidence.length === 2, `軒長=16m/根拠2辺（実 ${eave?.value}）`);

// ケラバ長 = 4辺 ×(300/50=6m) × stretch.area(5) = 24×1.118034 = 26.833m
const gable = get('gableLength')!;
const expGable = 24 * stretch.area(5);
ok(!!gable && close(gable.value, expGable) && gable.evidence.length === 4, `ケラバ長=${expGable.toFixed(3)}m/根拠4辺（実 ${gable?.value.toFixed(3)}）`);

// 谷は無い
ok(!get('valleyLength'), '谷長は出ない（切妻）');

// 逆引き：棟の辺クリック → 棟長に寄与
const ridgeEdgeId = ridge.evidence[0].id;
const back = evidenceOf(q, ridgeEdgeId);
ok(back.some((h) => h.key === 'ridgeLength' && close(h.contribution, 8)), '逆引き: 棟辺→棟長8m');

// Export 変換は evidence を落とす
const ev = toExportValues(q);
ok(ev.every((x) => !('evidence' in x)) && ev.length === q.length, 'toExportValues: evidence無し・件数一致');

if (fails.length) {
  console.error(`❌ Roof Quantity test: ${fails.length} 失敗 / ${pass + fails.length} 中`);
  for (const f of fails) console.error('   - ' + f);
  process.exit(1);
}
console.log(`✅ Roof Quantity test: 全 ${pass} 件合格（Evidence付き数量・逆引き・Export変換）`);
