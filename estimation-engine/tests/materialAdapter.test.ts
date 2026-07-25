// 甍AI Material Adapter 自己テスト（STEP5 / Material IR）— 数量→Intent→Product の2段。
//   ・Compiler Boundary：Geometry世界は製品を知らない。Intent は maker/sku を持たない（意図だけ）。
//   ・Intent は要素ごと（evidence 1件=Intent 1件）＝ID の糸を保つ。Product/rollup まで evidence 貫通。
//   ・Rule Engine：IF Intent THEN Product。maker 差し替え（Panasonic→別社）で Material IR は不変。
//   ・catalog(Knowledge) は注入。knowledge/material/*.json が canonical で TSバインディングと一致（drift禁止）。
import { readFileSync } from 'fs';
import { buildRoofModelFromFaces } from '../src/geometry/roofModel';
import type { DrainModel } from '../src/geometry/drainModel';
import { drainQuantities } from '../src/geometry/drainQuantities';
import { roofQuantities } from '../src/geometry/roofQuantities';
import { projectIntents, rollupIntents, unmappedQuantityKeys } from '../src/geometry/materialIntent';
import { resolveProduct, resolveMaterials, unresolvedMaterials, materialEvidenceOf } from '../src/geometry/productCatalog';
import type { ProductCatalog } from '../src/geometry/productCatalog';
import { compileMaterials } from '../src/geometry/materialAdapter';
import { defaultIntentCatalog, defaultProductCatalog } from '../src/geometry/materialCatalog';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const attrs = { trade: '屋根工事', item: '屋根材' };
const scale = 50;
const roof = buildRoofModelFromFaces([
  { vertices: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }], pitch: 5, attrs, eaveEdgeIndex: 0 },
  { vertices: [{ x: 0, y: 300 }, { x: 400, y: 300 }, { x: 400, y: 600 }, { x: 0, y: 600 }], pitch: 5, attrs, eaveEdgeIndex: 2 },
], { scale });
const eaveA = (roof.faces[0].slope.downhill as { toEdgeId: string }).toEdgeId;

// 縦Edge×2（e1,e3＝竪樋）/ 横Edge×1（e2＝呼び樋）/ elbow×2（n2,n3）/ drain×1（n4）/ 軒樋+集水器
const drain: DrainModel = {
  schemaVersion: 1, id: 'DR', roofId: roof.id,
  runs: [{ id: 'gr1', eaveEdgeId: eaveA, flowDirection: 'both', drops: [{ id: 'd1', position: 0.5 }] }],
  graph: {
    nodes: [
      { id: 'n1', kind: 'drop',  point: { x: 0,   y: 0 },   dropId: 'd1' },
      { id: 'n2', kind: 'elbow', point: { x: 0,   y: 150 } },  // e1 n1→n2 縦
      { id: 'n3', kind: 'elbow', point: { x: 100, y: 150 } },  // e2 n2→n3 横
      { id: 'n4', kind: 'drain', point: { x: 100, y: 300 } },  // e3 n3→n4 縦
    ],
    edges: [ { id: 'e1', from: 'n1', to: 'n2' }, { id: 'e2', from: 'n2', to: 'n3' }, { id: 'e3', from: 'n3', to: 'n4' } ],
  },
};

const dq = drainQuantities(roof, drain, scale);
const rq = roofQuantities(roof, scale);

// ───── Material IR：Geometry IR(数量) → Intent（要素ごと） ─────
const intents = projectIntents(dq, defaultIntentCatalog);
const vdrains = intents.filter((i) => i.kind === 'vertical_drain');
ok(vdrains.length === 2, `縦Edge×2 → vertical_drain intent が2件（要素ごと。got ${vdrains.length}）`);
ok(vdrains.every((i) => i.evidence.length === 1 && i.evidence[0].kind === 'segment'), '各 intent は要素1件（evidence=segment 1件）＝ID の糸');
ok(vdrains.some((i) => i.evidence[0].id === 'e1' && near(i.qty, 3)) && vdrains.some((i) => i.evidence[0].id === 'e3' && near(i.qty, 3)), 'vertical_drain は e1(3m)・e3(3m) に分かれる');
ok(vdrains.every((i) => i.attrs.diameter === 60 && i.attrs.style === 'standard'), 'vertical_drain の既定 attrs（φ60/standard）が載る');

// ★Compiler Boundary：Intent は製品を知らない（maker/series/sku を持たない）
ok(intents.every((i) => !('maker' in i) && !('series' in i) && !('sku' in i)), 'Intent は maker/series/sku を持たない（Geometry世界は製品を知らない）');

// 由来数量の evidence をそのまま継承（同一参照）
const dsQ = dq.find((q) => q.key === 'downspoutLength')!;
ok(intents.find((i) => i.evidence[0].id === 'e1')!.evidence[0] === dsQ.evidence.find((e) => e.id === 'e1'), 'Intent の evidence は数量の evidence を同一参照で継承');

// 意図の網羅（雨樋6種）
ok(['eave_gutter','outlet','vertical_drain','connector_drain','elbow','drain_outlet'].every((k) => intents.some((i) => i.kind === k)), '雨樋6意図を網羅');

// ───── rollup：同 kind+attrs を発注単位へ（evidence は連結） ─────
const rolled = rollupIntents(intents);
const rvd = rolled.find((r) => r.kind === 'vertical_drain')!;
ok(near(rvd.qty, 6) && rvd.evidence.length === 2, 'rollup：vertical_drain 3+3=6m・evidence 2件連結');
ok(rolled.find((r) => r.kind === 'elbow')!.qty === 2, 'rollup：elbow 2個（n2,n3）');

// ───── Rule Engine：IF Intent THEN Product ─────
ok(resolveProduct({ kind: 'vertical_drain', attrs: { diameter: 60, style: 'standard' } }, defaultProductCatalog)?.sku === 'PC50-60-BK', 'vertical_drain φ60 → PC50-60-BK');
ok(resolveProduct({ kind: 'vertical_drain', attrs: { diameter: 999 } }, defaultProductCatalog) === null, '未定義 attrs → 未解決(null)');
ok(resolveProduct({ kind: 'roof_field', attrs: {} }, defaultProductCatalog) === null, 'Panasonic 雨樋 rules に屋根は無い → null');

// ───── compileMaterials（2段パイプライン end-to-end） ─────
const mats = compileMaterials(dq, defaultIntentCatalog, defaultProductCatalog);
const vd = mats.find((m) => m.kind === 'vertical_drain')!;
ok(vd.product?.sku === 'PC50-60-BK' && near(vd.qty, 6) && vd.unit === 'm', '竪樋 → 製品 PC50-60-BK 6m');
ok(vd.evidence.length === 2 && vd.evidence.some((e) => e.id === 'e1') && vd.evidence.some((e) => e.id === 'e3'), '製品まで evidence（e1,e3）が貫通');
ok(mats.find((m) => m.kind === 'outlet')!.product?.sku === 'PC50-OUT-BK', '集水器 → PC50-OUT-BK');

// ★retargetability：maker 差し替えで Material IR(Intent) 不変・Product だけ変わる
const sekisui: ProductCatalog = { id: 'products-sekisui', maker: 'セキスイ', rules: [
  { when: { kind: 'vertical_drain', match: { diameter: 60 } }, product: { maker: 'セキスイ', series: 'ス', sku: 'SK-60', name: '竪樋60', unit: 'm' } },
] };
const intentsBefore = JSON.stringify(projectIntents(dq, defaultIntentCatalog));
const matsSekisui = compileMaterials(dq, defaultIntentCatalog, sekisui);
ok(matsSekisui.find((m) => m.kind === 'vertical_drain')!.product?.sku === 'SK-60', 'catalog 差し替えで製品が変わる（セキスイ SK-60）');
ok(JSON.stringify(projectIntents(dq, defaultIntentCatalog)) === intentsBefore, '製品を替えても Material IR(Intent) は不変（境界が効いている）');

// ───── 未解決の可視化（黙って落とさない） ─────
const buildingMats = compileMaterials([...rq, ...dq], defaultIntentCatalog, defaultProductCatalog);
ok(unresolvedMaterials(buildingMats).some((m) => m.kind === 'roof_field'), '屋根意図は Panasonic 雨樋 rules で未解決＝可視化される');
ok(unmappedQuantityKeys(dq, defaultIntentCatalog).length === 0, '雨樋数量は全て taxonomy に対応（未対応0）');

// ───── 逆引き（要素→部材） ─────
ok(materialEvidenceOf(mats, 'e1').some((h) => h.kind === 'vertical_drain' && h.product?.sku === 'PC50-60-BK'), '要素 e1 → 竪樋(PC50-60-BK) を逆引き');
ok(materialEvidenceOf(mats, 'd1').some((h) => h.kind === 'outlet'), '要素 d1 → 集水器 を逆引き');
ok(materialEvidenceOf(mats, 'nope').length === 0, '無関係な id → 0件');

// ───── 数量ゼロ→意図ゼロ ─────
const empty: DrainModel = { schemaVersion: 1, id: 'D0', roofId: roof.id, runs: [], graph: { nodes: [], edges: [] } };
ok(projectIntents(drainQuantities(roof, empty, scale), defaultIntentCatalog).length === 0, '数量ゼロ→意図ゼロ');

// ───── 純関数：入力不変・決定的 ─────
const snap = JSON.stringify(dq);
compileMaterials(dq, defaultIntentCatalog, defaultProductCatalog);
ok(JSON.stringify(dq) === snap, '入力(数量)を破壊しない');
ok(JSON.stringify(compileMaterials(dq, defaultIntentCatalog, defaultProductCatalog)) === JSON.stringify(mats), '同入力→同出力（決定的）');

// ───── Knowledge drift ガード：JSON(canonical) ↔ TSバインディング ─────
const intentJson = JSON.parse(readFileSync('knowledge/material/intent.json', 'utf8'));
const panaJson = JSON.parse(readFileSync('knowledge/material/products.panasonic.json', 'utf8'));
ok(intentJson.id === defaultIntentCatalog.id && JSON.stringify(intentJson.specs) === JSON.stringify(defaultIntentCatalog.specs), 'intent.json ↔ defaultIntentCatalog 一致');
ok(panaJson.id === defaultProductCatalog.id && JSON.stringify(panaJson.rules) === JSON.stringify(defaultProductCatalog.rules), 'products.panasonic.json ↔ defaultProductCatalog 一致');
// taxonomy は LOCK 射影表（縦=竪樋/横=呼び樋/elbow/drain/run/drop）と一対一
const drainKinds = defaultIntentCatalog.specs.filter((s) => ['gutterLength','outletCount','downspoutLength','connectorLength','elbowCount','drainCount'].includes(s.quantityKey)).map((s) => s.kind).join(',');
ok(drainKinds === 'eave_gutter,outlet,vertical_drain,connector_drain,elbow,drain_outlet', 'taxonomy が雨樋6意図を LOCK 射影表と一対一で対応');

if (fails.length) {
  console.error(`❌ Material Adapter test: ${fails.length} 失敗 / ${pass + fails.length} 中`);
  for (const f of fails) console.error('   - ' + f);
  process.exit(1);
}
console.log(`✅ Material Adapter test: 全 ${pass} 件合格（数量→Intent→Product・Compiler Boundary・maker差替で IR 不変・Evidence 貫通）`);
