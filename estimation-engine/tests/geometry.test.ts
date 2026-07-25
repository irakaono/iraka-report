// 甍AI Geometry Engine 自己テスト（e0.3.7①）— 「数字を覚える」のではなく「数学を守る」。
//   本番と同じ API（src/geometry/*）を直接叩く（憲法11）。lookup table / 誤植 / コピペで壊れないための固定。
//   実行: npm test  （esbuild で束ねて node 実行。フレームワーク不要）
import { stretch } from '../src/geometry/stretch';
import { convert } from '../src/geometry/convert';
import PITCH from '../knowledge/geometry/pitch.json';

let pass = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string) { if (cond) pass++; else fails.push(label); }
function close(a: number, b: number, tol = 1e-9) { return Math.abs(a - b) <= tol; }

const SQRT2 = Math.SQRT2;
// 全勾配（0.5寸〜12寸）を pitch.json の呼称辞書から取る。
const suns = PITCH.table.map((p) => p.m * 10);

for (const sun of suns) {
  const m = sun / 10;
  // 1) 定義式そのもの（面/登り/ケラバ）
  ok(close(stretch.area(sun), Math.sqrt(1 + m * m)), `area(${sun})=√(1+m²)`);
  ok(close(stretch.gable(sun), stretch.area(sun)), `gable(${sun})=area`);
  // 2) 角度の定義
  ok(close(convert.sunToDegree(sun), (Math.atan(m) * 180) / Math.PI), `deg(${sun})=atan(m)`);
  // 3) 隅棟の恒等式（数式同士で固定＝基準の取り違えを封じる）
  ok(close(stretch.hip(sun), Math.sqrt(1 + (m * m) / 2)), `hip(${sun})=√(1+m²/2)`);
  ok(close(stretch.valley(sun), stretch.hip(sun)), `valley(${sun})=hip`);
  ok(close(stretch.hipVsHorizontal(sun), stretch.hip(sun) * SQRT2), `hipVsHorizontal=hip×√2 @${sun}`);
  ok(close(stretch.hipVsSlope(sun), stretch.hipVsHorizontal(sun) / stretch.area(sun)), `hipVsSlope=hipVsH/area @${sun}`);
  // 4) 水平(棟/軒)は常に1
  ok(stretch.ridge() === 1 && stretch.eave() === 1, `ridge/eave=1 @${sun}`);
}

// 5) round-trip: 寸→角度→寸
for (const sun of [3, 5, 8, 10]) {
  ok(close(convert.degreeToSun(convert.sunToDegree(sun)), sun, 1e-6), `sun↔deg round-trip @${sun}`);
}

// 6) 誤植ガード（旧 knowledge.js が焼き込んだ早見表の転記ミスを二度と正当化しない）
ok(close(stretch.area(3.5), 1.0595, 5e-4), '3.5寸 流れ=1.059（誤植1.050を拒否）');
ok(!close(stretch.area(3.5), 1.050, 5e-4), '3.5寸 は 1.050 ではない');
ok(close(stretch.hipVsHorizontal(6.5), 1.5564, 5e-4), '6.5寸 隅棟対水平=1.556（誤植1.566を拒否）');
ok(!close(stretch.hipVsHorizontal(6.5), 1.566, 5e-4), '6.5寸 は 1.566 ではない');

// 7) fixture 整合: engine の算出が pitch.json（式生成・補正済み）の 3桁表示と一致
const r3 = (x: number) => Math.round(x * 1000) / 1000;
for (const p of PITCH.table) {
  const sun = p.m * 10;
  ok(r3(stretch.area(sun)) === p.areaStretch, `fixture area @${p.name}`);
  ok(r3(stretch.hipVsHorizontal(sun)) === p.hip.vsHorizontal, `fixture hipVsHorizontal @${p.name}`);
  ok(r3(stretch.hipVsSlope(sun)) === p.hip.vsSlope, `fixture hipVsSlope @${p.name}`);
}

if (fails.length) {
  console.error(`❌ Geometry Engine test: ${fails.length} 失敗 / ${pass + fails.length} 中`);
  for (const f of fails) console.error('   - ' + f);
  process.exit(1);
}
console.log(`✅ Geometry Engine test: 全 ${pass} 件合格（数式の恒等式＋誤植ガード＋fixture整合）`);
