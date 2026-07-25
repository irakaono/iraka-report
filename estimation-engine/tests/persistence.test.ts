// 甍AI Persistence 自己テスト（STEP4-D）— 保存・復元。
//   ★ IDs are immutable：復元後も node/edge/run/drop の id が逐語一致。
//   ★ Phase1 完成条件：保存→再読込 で 数量・Validator・Evidence が完全復元（ID が繋ぐ）。
//   ★ 派生物は保存しない（Model だけ）。壊れたファイルは黙って直さず拒否。
import { buildRoofModelFromFaces } from '../src/geometry/roofModel';
import type { DrainModel } from '../src/geometry/drainModel';
import { drainQuantities } from '../src/geometry/drainQuantities';
import { validateDrainModel } from '../src/geometry/drainValidator';
import { serializeDocument, parseDocument, maxIdSuffix, DOC_KIND } from '../src/geometry/persistence';
import type { PersistFace } from '../src/geometry/persistence';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };
const throws = (fn: () => void, l: string) => { try { fn(); fails.push(l + '（例外が出なかった）'); } catch { pass++; } };
const attrs = { trade: '屋根工事', item: '屋根材' };
const SCALE = 50;

const faces: PersistFace[] = [
  { vertices: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }], pitch: 5, eaveEdgeIndex: 0 },
  { vertices: [{ x: 0, y: 300 }, { x: 400, y: 300 }, { x: 400, y: 600 }, { x: 0, y: 600 }], pitch: 5, eaveEdgeIndex: 2 },
];
const roof = buildRoofModelFromFaces(faces.map((f) => ({ ...f, attrs })), { scale: SCALE });
const eaveA = (roof.faces[0].slope.downhill as { toEdgeId: string }).toEdgeId;

// L字経路：drop → elbow → drain（竪樋＋呼び樋＋エルボ＋排水 が全部出る構成）
const drain: DrainModel = {
  schemaVersion: 1, id: 'DR-1', roofId: roof.id,
  runs: [{ id: 'gr-1', eaveEdgeId: eaveA, flowDirection: 'both', drops: [{ id: 'd-2', position: 0.5 }] }],
  graph: {
    nodes: [
      { id: 'n-3', kind: 'drop', point: { x: 200, y: 0 }, dropId: 'd-2' },
      { id: 'n-4', kind: 'elbow', point: { x: 200, y: 100 } },
      { id: 'n-5', kind: 'drain', point: { x: 350, y: 100 } },
    ],
    edges: [{ id: 'e-6', from: 'n-3', to: 'n-4' }, { id: 'e-7', from: 'n-4', to: 'n-5' }],
  },
};

// 派生（保存前）
const qBefore = drainQuantities(roof, drain, SCALE);
const issuesBefore = validateDrainModel(roof, drain);

// ── 1) ラウンドトリップ（Model 逐語一致・派生物は保存しない） ──
const json = serializeDocument(faces, drain, '2026-07-24T00:00:00Z');
ok(!json.includes('gutterLength') && !json.includes('QuantityResult') && !json.includes('downspoutLength'), '保存に派生物（数量）を含まない');
ok(json.includes('"kind"') && JSON.parse(json).kind === DOC_KIND, 'kind を持つ');
const back = parseDocument(json);

// ★ IDs are immutable
ok(back.drain.runs[0].id === 'gr-1' && back.drain.runs[0].drops[0].id === 'd-2', 'run/drop id 逐語一致');
ok(back.drain.graph.nodes.map((n) => n.id).join(',') === 'n-3,n-4,n-5', 'node id 逐語一致（順序も）');
ok(back.drain.graph.edges.map((e) => e.id).join(',') === 'e-6,e-7', 'edge id 逐語一致');
ok(back.drain.graph.nodes[0].dropId === 'd-2', 'node.dropId 逐語一致');
ok(JSON.stringify(back.drain) === JSON.stringify(drain), 'drain Model 完全一致');
ok(JSON.stringify(back.faces) === JSON.stringify(faces), 'roof faces 完全一致');

// ── 2) 数量・Validator・Evidence 完全復元（Phase1 完成条件） ──
const roof2 = buildRoofModelFromFaces(back.faces.map((f) => ({ ...f, attrs })), { scale: SCALE });
ok(roof2.edges.map((e) => e.id).join(',') === roof.edges.map((e) => e.id).join(','), 'roof edge id 決定的再構築（保存元と一致）');
const qAfter = drainQuantities(roof2, back.drain, SCALE);
ok(JSON.stringify(qAfter) === JSON.stringify(qBefore), '数量が完全復元（値も Evidence id も一致）');
// Evidence が生きている：竪樋長の evidence が segment(edge) を指し、その edge が復元後も存在
const dsAfter = qAfter.find((q) => q.key === 'downspoutLength')!;
ok(dsAfter.evidence.every((ev) => back.drain.graph.edges.some((e) => e.id === ev.id)), '竪樋長 Evidence(segment) が復元後の edge を全て指す');
const issuesAfter = validateDrainModel(roof2, back.drain);
ok(JSON.stringify(issuesAfter.map((i) => i.code)) === JSON.stringify(issuesBefore.map((i) => i.code)), 'Validator の指摘が完全復元');

// ── 3) 新規採番の継続（既存 id と衝突しない） ──
ok(maxIdSuffix(back.drain) === 7, `maxIdSuffix=7（次の採番は 8 から）実際=${maxIdSuffix(back.drain)}`);

// ── 4) 壊れたファイルは拒否（黙って直さない） ──
throws(() => parseDocument('not json {'), 'JSON でない → 拒否');
throws(() => parseDocument(JSON.stringify({ schemaVersion: 2, kind: DOC_KIND, roof: { faces }, drain })), 'schemaVersion 不一致 → 拒否');
throws(() => parseDocument(JSON.stringify({ schemaVersion: 1, kind: 'other', roof: { faces }, drain })), 'kind 不一致 → 拒否');
const dupNode = JSON.parse(json); dupNode.drain.graph.nodes[1].id = 'n-3';
throws(() => parseDocument(JSON.stringify(dupNode)), 'node id 重複 → 拒否');
const noGraph = JSON.parse(json); delete noGraph.drain.graph;
throws(() => parseDocument(JSON.stringify(noGraph)), 'graph 欠落 → 拒否');
const badKind = JSON.parse(json); badKind.drain.graph.nodes[1].kind = 'bogus';
throws(() => parseDocument(JSON.stringify(badKind)), 'node.kind 不正 → 拒否');

// ── 5) 空ドキュメント（新規案件）も往復できる ──
const emptyDrain: DrainModel = { schemaVersion: 1, id: 'DR-1', runs: [], graph: { nodes: [], edges: [] } };
const back2 = parseDocument(serializeDocument([], emptyDrain));
ok(back2.faces.length === 0 && back2.drain.runs.length === 0 && back2.drain.graph.nodes.length === 0, '空ドキュメントの往復');

if (fails.length) {
  console.error(`❌ Persistence test: ${fails.length} 失敗 / ${pass + fails.length} 中`);
  for (const f of fails) console.error('   - ' + f);
  process.exit(1);
}
console.log(`✅ Persistence test: 全 ${pass} 件合格（ID不変・数量/Validator/Evidence完全復元・破損拒否）`);
