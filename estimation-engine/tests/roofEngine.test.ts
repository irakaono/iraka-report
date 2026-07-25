// 甍AI Roof Geometry Engine 自己テスト — 役割の創発（EdgeRole）。
//   「面は自分の軒を指す」だけで、棟/隅棟/谷/軒/ケラバ が自動で決まることを式で固定。
import { buildRoofModelFromFaces } from '../src/geometry/roofModel';
import { roleCounts } from '../src/geometry/roofEngine';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };
const attrs = { trade: '屋根工事', item: '横暖S 本体' };
const eq = (got: Record<string, number>, exp: Record<string, number>) =>
  JSON.stringify(Object.fromEntries(Object.entries(got).sort())) ===
  JSON.stringify(Object.fromEntries(Object.entries(exp).sort()));

// ── 切妻: 2面が棟を共有。各面は外側の水平辺(軒)へ流れる ──
const kirizuma = buildRoofModelFromFaces([
  { vertices: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }], pitch: 5, attrs, eaveEdgeIndex: 0 },
  { vertices: [{ x: 0, y: 300 }, { x: 400, y: 300 }, { x: 400, y: 600 }, { x: 0, y: 600 }], pitch: 5, attrs, eaveEdgeIndex: 2 },
], { scale: 50 });
const rk = roleCounts(kirizuma);
ok(eq(rk, { ridge: 1, eave: 2, gable: 4 }), `切妻 → 棟1/軒2/ケラバ4（実 ${JSON.stringify(rk)}）`);

// ── 方形（ピラミッド型 寄棟）: 4三角面が中心に集まる → 隅棟4・軒4、棟なし ──
const hougyou = buildRoofModelFromFaces([
  { vertices: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 200, y: 200 }], pitch: 5, attrs, eaveEdgeIndex: 0 },
  { vertices: [{ x: 400, y: 0 }, { x: 400, y: 400 }, { x: 200, y: 200 }], pitch: 5, attrs, eaveEdgeIndex: 0 },
  { vertices: [{ x: 400, y: 400 }, { x: 0, y: 400 }, { x: 200, y: 200 }], pitch: 5, attrs, eaveEdgeIndex: 0 },
  { vertices: [{ x: 0, y: 400 }, { x: 0, y: 0 }, { x: 200, y: 200 }], pitch: 5, attrs, eaveEdgeIndex: 0 },
], { scale: 50 });
const rh = roleCounts(hougyou);
ok(eq(rh, { hip: 4, eave: 4 }), `方形 → 隅棟4/軒4（実 ${JSON.stringify(rh)}）`);

// ── 片流れ: 1面 → 軒2・ケラバ2のみ（棟/谷/隅棟は出ない＝共有辺が無い） ──
const katanagare = buildRoofModelFromFaces([
  { vertices: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }], pitch: 5, attrs, eaveEdgeIndex: 0 },
], { scale: 50 });
const rc = roleCounts(katanagare);
ok(eq(rc, { eave: 2, gable: 2 }), `片流れ → 軒2/ケラバ2（実 ${JSON.stringify(rc)}）`);

if (fails.length) {
  console.error(`❌ Roof Engine test: ${fails.length} 失敗 / ${pass + fails.length} 中`);
  for (const f of fails) console.error('   - ' + f);
  process.exit(1);
}
console.log(`✅ Roof Engine test: 全 ${pass} 件合格（切妻=棟/方形=隅棟/片流れ=軒ケラバ の創発）`);
