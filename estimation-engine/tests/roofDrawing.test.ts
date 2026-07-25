// 甍AI Roof Drawing 自己テスト — 伏図の「再構築（決定的射影）」。
//   Roof Model → 作図プリミティブが、役割・流れ方向・外接矩形まで正しく復元されることを固定。
import { buildRoofModelFromFaces } from '../src/geometry/roofModel';
import { roofDrawing } from '../src/geometry/roofDrawing';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };
const attrs = { trade: '屋根工事', item: '屋根材' };

// 切妻（上面の軒=上辺、下面の軒=下辺、共有=中央棟）
const model = buildRoofModelFromFaces([
  { vertices: [{ x: 100, y: 100 }, { x: 500, y: 100 }, { x: 500, y: 250 }, { x: 100, y: 250 }], pitch: 5, attrs, eaveEdgeIndex: 0 },
  { vertices: [{ x: 100, y: 250 }, { x: 500, y: 250 }, { x: 500, y: 400 }, { x: 100, y: 400 }], pitch: 5, attrs, eaveEdgeIndex: 2 },
], { scale: 50 });
const d = roofDrawing(model);

// 辺: 7本、役割の内訳 棟1/軒2/ケラバ4
ok(d.edges.length === 7, `辺=7（実 ${d.edges.length}）`);
const rc: Record<string, number> = {};
for (const e of d.edges) if (e.role) rc[e.role] = (rc[e.role] ?? 0) + 1;
ok(rc.ridge === 1 && rc.eave === 2 && rc.gable === 4, `役割 棟1/軒2/ケラバ4（実 ${JSON.stringify(rc)}）`);

// 各辺は端点を持つ（線が引ける）
ok(d.edges.every((e) => e.a && e.b && (e.a.x !== e.b.x || e.a.y !== e.b.y)), '全辺に端点あり');

// 面: 2枚、流れ方向（downhill）を持つ。上面は上向き(y<0)、下面は下向き(y>0)
ok(d.faces.length === 2, '面=2');
const up = d.faces.find((f) => f.downhill && f.downhill.y < -0.5);
const down = d.faces.find((f) => f.downhill && f.downhill.y > 0.5);
ok(!!up && !!down, `流れ方向: 上面↑・下面↓（実 ${d.faces.map((f) => f.downhill && f.downhill.y.toFixed(2))}）`);

// 外接矩形
ok(d.bounds.minX === 100 && d.bounds.minY === 100 && d.bounds.maxX === 500 && d.bounds.maxY === 400, `bounds 正（実 ${JSON.stringify(d.bounds)}）`);

if (fails.length) {
  console.error(`❌ Roof Drawing test: ${fails.length} 失敗 / ${pass + fails.length} 中`);
  for (const f of fails) console.error('   - ' + f);
  process.exit(1);
}
console.log(`✅ Roof Drawing test: 全 ${pass} 件合格（伏図の決定的再構築・役割・流れ方向・外接矩形）`);
