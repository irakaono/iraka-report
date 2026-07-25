// 甍AI Roof Model 自己テスト（Phase 1・型＋素関数）。本番と同じ API を叩く（憲法11）。
//   切妻＝2面が1本の棟(辺)を共有 → 頂点/辺 dedup・共有辺・面積・辺長を式で固定。
import {
  buildRoofModelFromFaces, faceArea, edgeLength, edgeFaceCount, isSharedEdge, facePolygon,
} from '../src/geometry/roofModel';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };
const close = (a: number, b: number, t = 1e-9) => Math.abs(a - b) <= t;

// 切妻: Face A(下) と Face B(上) が辺 (0,300)-(400,300) を共有
const attrs = { trade: '屋根工事', item: '横暖S 本体' };
const model = buildRoofModelFromFaces([
  { vertices: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }], pitch: 5, attrs },
  { vertices: [{ x: 0, y: 300 }, { x: 400, y: 300 }, { x: 400, y: 600 }, { x: 0, y: 600 }], pitch: 5, attrs },
], { scale: 50, name: '切妻テスト' });

// 1) dedup: 頂点6・辺7（4+4-1）
ok(model.vertices.length === 6, `頂点 dedup=6（実 ${model.vertices.length}）`);
ok(model.edges.length === 7, `辺 dedup=7（実 ${model.edges.length}）`);
ok(model.faces.length === 2, '面=2');

// 2) 共有辺（棟）はちょうど1本、他は境界辺
const counts = [...edgeFaceCount(model).values()];
ok(counts.filter((c) => c === 2).length === 1, '共有辺（棟候補）は1本');
ok(counts.filter((c) => c === 1).length === 6, '境界辺は6本');

// 共有辺 = (0,300)-(400,300)。長さ400、水平（＝将来 ridge 判定の素）
const V = new Map(model.vertices.map((v) => [v.id, v]));
const sharedEdge = model.edges.find((e) => isSharedEdge(model, e.id))!;
ok(!!sharedEdge, '共有辺が取得できる');
ok(close(edgeLength(model, sharedEdge), 400), `共有辺長=400（実 ${edgeLength(model, sharedEdge)}）`);
const a = V.get(sharedEdge.v[0])!, b = V.get(sharedEdge.v[1])!;
ok(a.y === b.y, '共有辺は水平（棟の素）');

// 3) 面積（px²）: 各 400×300 = 120000、合計 240000
ok(close(faceArea(model, model.faces[0]), 120000), `面A面積=120000（実 ${faceArea(model, model.faces[0])}）`);
ok(close(faceArea(model, model.faces[1]), 120000), `面B面積=120000`);
const total = model.faces.reduce((s, f) => s + faceArea(model, f), 0);
ok(close(total, 240000), `合計平面積=240000（実 ${total}）`);

// 4) facePolygon が4頂点の閉ループを返す
ok(facePolygon(model, model.faces[0]).length === 4, 'facePolygon=4頂点');

if (fails.length) {
  console.error(`❌ Roof Model test: ${fails.length} 失敗 / ${pass + fails.length} 中`);
  for (const f of fails) console.error('   - ' + f);
  process.exit(1);
}
console.log(`✅ Roof Model test: 全 ${pass} 件合格（Face合成・dedup・共有辺・面積・辺長）`);
