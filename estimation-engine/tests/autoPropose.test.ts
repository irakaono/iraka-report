// 自動提案(AI積算 v0)のテスト。屋根 Geometry → 雨樋提案 → 既存 drainQuantities が妥当な数量を出すか。
import { buildRoofModelFromFaces } from '../src/geometry/roofModel';
import { autoProposeGutter } from '../src/geometry/autoPropose';
import { drainQuantities } from '../src/geometry/drainQuantities';

let n = 0;
const ok = (c: boolean, m: string) => { if (!c) throw new Error('FAIL: ' + m); n++; };

// 切妻2面（軒2本）。scale=50px/m。
const faces = [
  { vertices: [{ x: 100, y: 100 }, { x: 600, y: 100 }, { x: 600, y: 250 }, { x: 100, y: 250 }], pitch: 5, attrs: { trade: '屋根工事', item: '屋根材' }, eaveEdgeIndex: 0 },
  { vertices: [{ x: 100, y: 250 }, { x: 600, y: 250 }, { x: 600, y: 400 }, { x: 100, y: 400 }], pitch: 5, attrs: { trade: '屋根工事', item: '屋根材' }, eaveEdgeIndex: 2 },
];
const roof = buildRoofModelFromFaces(faces, { scale: 50 });
const prop = autoProposeGutter(roof);

ok(prop.eaveCount >= 1, '軒が検出される');
ok(prop.dropCount === prop.eaveCount * 2, '集水器は軒×2（両端）');
ok(prop.model.runs.length === prop.eaveCount, '軒樋runは軒本数');
ok(prop.model.graph.edges.length === prop.dropCount, '縦樋edgeは集水器数');
ok(prop.model.graph.nodes.filter((x) => x.kind === 'drain').length === prop.dropCount, 'drainノードは集水器数');

const q = drainQuantities(roof, prop.model, 50);
const get = (k: string) => q.find((x) => x.key === k)?.value ?? 0;
ok(get('gutterLength') > 0, '軒樋長 > 0');
ok(get('outletCount') === prop.dropCount, `集水器数=${prop.dropCount}`);
// 縦樋: 各 150px / 50 = 3m × dropCount
ok(Math.abs(get('downspoutLength') - (150 / 50) * prop.dropCount) < 1e-6, '縦樋長=3m×集水器数');
// 純関数：呼んでも roof は不変
ok(roof.edges.length > 0, 'roof は不変（副作用なし）');

console.log(`✅ AutoPropose(AI積算 v0) test: 全 ${n} 件合格（屋根→雨樋提案→drainQuantities 妥当）`);
