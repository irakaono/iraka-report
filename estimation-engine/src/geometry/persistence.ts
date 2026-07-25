// 甍AI Persistence — Model の保存・復元（STEP4-D）。
//   ★ 保存するのは Model（幾何＋属性＋ID）だけ。数量・図面・部材などの派生物は保存しない（Evidence First）。
//   ★ IDs are immutable：node/edge/run/drop の id を保存時も読込時も一切書き換えない。
//     Reducer / Validator / Quantity Evidence / Material Adapter は全て id で繋がる。id が変われば Evidence が全部切れる。
//   ★ Roof の ID（V-/E-/F-）は同じ入力(faces)から決定的に再構築されるため保存元と一致する。
//     Drain の runs/drops と経路 Graph の nodes/edges は逐語保存する。
import type { Point } from './roofModel';
import type { DrainModel, GutterRun, DrainGraph } from './drainModel';

export const DOC_SCHEMA_VERSION = 1 as const;
export const DOC_KIND = 'iraka-engine-studio' as const;

// Studio の屋根編集フォーム（Roof 編集の Command 化までは faces が屋根の入力源）。
export interface PersistFace { vertices: Point[]; pitch: number; eaveEdgeIndex: number }

export interface IrakaDocument {
  schemaVersion: 1;
  kind: 'iraka-engine-studio';
  savedAt?: string;                 // 表示用メタ（真実ではない）
  roof: { faces: PersistFace[] };
  drain: DrainModel;
}

function fail(msg: string): never { throw new Error(`保存ファイルを開けません: ${msg}`); }
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0;

function checkFaces(faces: unknown): PersistFace[] {
  if (!Array.isArray(faces)) fail('roof.faces が配列でありません');
  return faces.map((f: any, i) => {
    if (!f || !Array.isArray(f.vertices) || f.vertices.length < 3) fail(`roof.faces[${i}] の頂点が不足`);
    for (const v of f.vertices) if (!isNum(v?.x) || !isNum(v?.y)) fail(`roof.faces[${i}] の頂点座標が不正`);
    if (!isNum(f.pitch)) fail(`roof.faces[${i}].pitch が不正`);
    if (!isNum(f.eaveEdgeIndex)) fail(`roof.faces[${i}].eaveEdgeIndex が不正`);
    return { vertices: f.vertices.map((v: any) => ({ x: v.x, y: v.y })), pitch: f.pitch, eaveEdgeIndex: f.eaveEdgeIndex };
  });
}

// ★ ID を verbatim で保持しつつ、非空・一意でなければ壊れたファイルとして拒否（黙って振り直さない）。
function checkDrain(drain: unknown): DrainModel {
  const d = drain as any;
  if (!d || typeof d !== 'object') fail('drain がありません');
  if (d.schemaVersion !== 1) fail(`未対応の drain.schemaVersion=${d.schemaVersion}`);
  if (!isStr(d.id)) fail('drain.id が不正');
  if (!Array.isArray(d.runs)) fail('drain.runs が配列でありません');
  if (!d.graph || !Array.isArray(d.graph.nodes) || !Array.isArray(d.graph.edges)) fail('drain.graph の構造が不正');

  const runIds = new Set<string>(); const dropIds = new Set<string>();
  const runs: GutterRun[] = d.runs.map((r: any) => {
    if (!isStr(r?.id)) fail('run.id が不正'); if (runIds.has(r.id)) fail(`run.id 重複: ${r.id}`); runIds.add(r.id);
    if (!isStr(r.eaveEdgeId)) fail(`run ${r.id} の eaveEdgeId が不正`);
    if (r.flowDirection !== 'left' && r.flowDirection !== 'right' && r.flowDirection !== 'both') fail(`run ${r.id} の flowDirection が不正`);
    if (!Array.isArray(r.drops)) fail(`run ${r.id} の drops が配列でありません`);
    const drops = r.drops.map((dr: any) => {
      if (!isStr(dr?.id)) fail('drop.id が不正'); if (dropIds.has(dr.id)) fail(`drop.id 重複: ${dr.id}`); dropIds.add(dr.id);
      if (!isNum(dr.position)) fail(`drop ${dr.id} の position が不正`);
      return { id: dr.id, position: dr.position };
    });
    return { id: r.id, eaveEdgeId: r.eaveEdgeId, flowDirection: r.flowDirection, drops };
  });

  const nodeIds = new Set<string>();
  const nodes = d.graph.nodes.map((n: any) => {
    if (!isStr(n?.id)) fail('node.id が不正'); if (nodeIds.has(n.id)) fail(`node.id 重複: ${n.id}`); nodeIds.add(n.id);
    if (n.kind !== 'drop' && n.kind !== 'elbow' && n.kind !== 'drain' && n.kind !== 'junction') fail(`node ${n.id} の kind が不正`);
    if (!isNum(n.point?.x) || !isNum(n.point?.y)) fail(`node ${n.id} の point が不正`);
    return { id: n.id, kind: n.kind, point: { x: n.point.x, y: n.point.y }, ...(isStr(n.dropId) ? { dropId: n.dropId } : {}) };
  });
  const edgeIds = new Set<string>();
  const edges = d.graph.edges.map((e: any) => {
    if (!isStr(e?.id)) fail('edge.id が不正'); if (edgeIds.has(e.id)) fail(`edge.id 重複: ${e.id}`); edgeIds.add(e.id);
    if (!isStr(e.from) || !isStr(e.to)) fail(`edge ${e.id} の端点が不正`);
    return { id: e.id, from: e.from, to: e.to };
  });

  const graph: DrainGraph = { nodes, edges };
  return { schemaVersion: 1, id: d.id, ...(isStr(d.roofId) ? { roofId: d.roofId } : {}), runs, graph };
}

export function serializeDocument(faces: PersistFace[], drain: DrainModel, savedAt?: string): string {
  const doc: IrakaDocument = { schemaVersion: DOC_SCHEMA_VERSION, kind: DOC_KIND, ...(savedAt ? { savedAt } : {}), roof: { faces }, drain };
  return JSON.stringify(doc, null, 2);
}

export function parseDocument(input: string | unknown): { faces: PersistFace[]; drain: DrainModel; savedAt?: string } {
  let o: any;
  try { o = typeof input === 'string' ? JSON.parse(input) : input; }
  catch { fail('JSON として読めません'); }
  if (!o || typeof o !== 'object') fail('形式が不正');
  if (o.schemaVersion !== DOC_SCHEMA_VERSION) fail(`未対応の schemaVersion=${o.schemaVersion}`);
  if (o.kind !== DOC_KIND) fail(`種別が違います（kind=${o.kind}）`);
  if (!o.roof) fail('roof がありません');
  const faces = checkFaces(o.roof.faces);
  const drain = checkDrain(o.drain);
  return { faces, drain, ...(isStr(o.savedAt) ? { savedAt: o.savedAt } : {}) };
}

// 復元後の新規採番を、既存 ID の数値サフィックス最大値の次から続ける（既存 ID との衝突を作らない）。
export function maxIdSuffix(drain: DrainModel): number {
  let max = 0;
  const scan = (id: string) => { const m = /(\d+)\s*$/.exec(id); if (m) max = Math.max(max, Number(m[1])); };
  for (const r of drain.runs) { scan(r.id); for (const d of r.drops) scan(d.id); }
  for (const n of drain.graph.nodes) scan(n.id);
  for (const e of drain.graph.edges) scan(e.id);
  return max;
}
