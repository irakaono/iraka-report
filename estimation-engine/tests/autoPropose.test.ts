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
// ★縦樋は提案しない（平面には描かない）＝graph は空。集水器は runs.drops が真実。
ok(prop.model.graph.edges.length === 0, '縦樋edgeは提案しない（graph空）');
ok(prop.model.graph.nodes.length === 0, '縦樋/節点は提案しない（graph空）');

const q = drainQuantities(roof, prop.model, 50);
const get = (k: string) => q.find((x) => x.key === k)?.value ?? 0;
const has = (k: string) => q.some((x) => x.key === k);
ok(get('gutterLength') > 0, '軒樋長 > 0');
ok(get('outletCount') === prop.dropCount, `集水器数=${prop.dropCount}（提案で確定）`);
// ★縦樋長は「未確定」＝提案では数量に出さない（0でも概算でもなく、行を出さない）。立面の Drain Runtime で確定。
ok(!has('downspoutLength'), '縦樋長は提案に出さない（未確定＝立面で確定）');
// 純関数：呼んでも roof は不変
ok(roof.edges.length > 0, 'roof は不変（副作用なし）');

console.log(`✅ AutoPropose(AI積算 v0) test: 全 ${n} 件合格（屋根→軒樋・集水器の提案／縦樋は未確定＝平面に描かない）`);
