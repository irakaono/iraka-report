// 甍AI Engine Studio（Roof + Drain）— Engine Runtime v1.0 の最初のクライアント。
//   ★Studio は薄く保つ：UI は Command を dispatch し、History/Validator/Drawing/Quantity を「表示」するだけ。
//     Reducer / Validator / Drawing / Quantity のロジックは一切持たない（全部 Runtime を呼ぶ）。
//   ★排水経路は Node/Edge Graph が唯一の真実。Studio は Graph を Polyline として編集・表示するだけ。
//   モード: Selection / Gutter Edit / Measure。Gutter Edit で 軒樋→集水器→（竪樋→エルボ→呼び樋→排水）を Command で編集。
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Stage, Layer, Line, Circle, Rect, Text, Arrow } from 'react-konva';
import type { Point } from '../geometry/roofModel';
import { buildRoofModelFromFaces, faceArea, edgeLength, facePolygon } from '../geometry/roofModel';
import { edgeRole, roofType } from '../geometry/roofEngine';
import { roofQuantities } from '../geometry/roofQuantities';
import { roofDrawing } from '../geometry/roofDrawing';
import { emptyDrainModel } from '../geometry/drainModel';
import type { DrainModel, FlowDirection, DrainNodeKind } from '../geometry/drainModel';
import { drainReducer } from '../geometry/drainCommands';
import type { DrainCommand } from '../geometry/drainCommands';
import { initHistory, dispatch as histDispatch, undo, redo, canUndo, canRedo } from '../geometry/history';
import type { History } from '../geometry/history';
import { drainQuantities } from '../geometry/drainQuantities';
import { compileMaterials, compileExecution, bomProjection, costCompiler, scheduleCompile, qaCompile, carbonCompile, resourceCompile } from '../geometry/materialAdapter';
import { defaultIntentCatalog, defaultProductCatalog, defaultAssemblyCatalog, exampleCostKnowledge, exampleScheduleKnowledge, exampleQAProgram, exampleCarbonProgram, exampleResourceProgram } from '../geometry/materialCatalog';
import { drainDrawing } from '../geometry/drainDrawing';
import { validateDrainModel } from '../geometry/drainValidator';
import { serializeDocument, parseDocument, maxIdSuffix } from '../geometry/persistence';

// iraka-report 埋め込み時のホスト（js/estimation-bridge.js が ?projectId 連携で window にセット）。無ければ standalone。
interface EstimationHost {
  projectId?: string | null;
  loadModel: () => Promise<string | null>;
  saveModel: (json: string) => Promise<void>;
}
function estimationHost(): EstimationHost | undefined {
  return typeof window !== 'undefined'
    ? (window as unknown as { IrakaEstimationHost?: EstimationHost }).IrakaEstimationHost
    : undefined;
}

const SCALE = 50;
const W = 720, H = 560;
const ROLE_COLOR: Record<string, string> = { ridge: '#e03131', hip: '#e8590c', valley: '#1971c2', eave: '#2f9e44', gable: '#7048e8' };
const ROLE_LABEL: Record<string, string> = { ridge: '棟', hip: '隅棟', valley: '谷', eave: '軒', gable: 'ケラバ' };
const TYPE_LABEL: Record<string, string> = { shed: '片流れ', gable: '切妻', hip: '寄棟/方形', saltbox: '招き', lean_to: '差し掛け' };
const GUTTER = '#1971c2', DROP = '#e8590c', FLOW = '#74c0fc';
const DOWNSPOUT = '#495057', CONNECTOR = '#0ca678', ELBOW = '#f08c00', DRAINC = '#c2255c';

interface FaceInput { vertices: Point[]; pitch: number; eaveEdgeIndex: number }
type Mode = 'select' | 'gutter' | 'measure';

function preset(name: 'gable' | 'hipped' | 'shed'): FaceInput[] {
  if (name === 'gable') return [
    { vertices: [{ x: 150, y: 100 }, { x: 550, y: 100 }, { x: 550, y: 250 }, { x: 150, y: 250 }], pitch: 5, eaveEdgeIndex: 0 },
    { vertices: [{ x: 150, y: 250 }, { x: 550, y: 250 }, { x: 550, y: 400 }, { x: 150, y: 400 }], pitch: 5, eaveEdgeIndex: 2 },
  ];
  if (name === 'hipped') return [
    { vertices: [{ x: 150, y: 100 }, { x: 550, y: 100 }, { x: 350, y: 250 }], pitch: 5, eaveEdgeIndex: 0 },
    { vertices: [{ x: 550, y: 100 }, { x: 550, y: 400 }, { x: 350, y: 250 }], pitch: 5, eaveEdgeIndex: 0 },
    { vertices: [{ x: 550, y: 400 }, { x: 150, y: 400 }, { x: 350, y: 250 }], pitch: 5, eaveEdgeIndex: 0 },
    { vertices: [{ x: 150, y: 400 }, { x: 150, y: 100 }, { x: 350, y: 250 }], pitch: 5, eaveEdgeIndex: 0 },
  ];
  return [{ vertices: [{ x: 200, y: 150 }, { x: 520, y: 150 }, { x: 520, y: 380 }, { x: 200, y: 380 }], pitch: 5, eaveEdgeIndex: 0 }];
}
const bottomEdgeIndex = (poly: Point[]): number => {
  let best = 0, bestY = -Infinity;
  for (let j = 0; j < poly.length; j++) { const my = (poly[j].y + poly[(j + 1) % poly.length].y) / 2; if (my > bestY) { bestY = my; best = j; } }
  return best;
};

export default function RoofStudio() {
  const [faces, setFaces] = useState<FaceInput[]>(() => preset('gable'));
  const [draft, setDraft] = useState<Point[]>([]);
  const [drawingFace, setDrawingFace] = useState(false);
  const [hi, setHi] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>('select');
  const [flow, setFlow] = useState<FlowDirection>('both');
  const [activeRun, setActiveRun] = useState<string | null>(null);
  const [selDrop, setSelDrop] = useState<string | null>(null);
  // 経路編集（STEP4-B）：routeHead=いま伸ばしている Node。nextKind=次に置く途中点の種別。
  const [routeHead, setRouteHead] = useState<string | null>(null);
  const [nextKind, setNextKind] = useState<'elbow' | 'drain'>('elbow');
  // 保存・復元（STEP4-D）
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const idc = useRef(1);
  const nid = (p: string) => `${p}-${idc.current++}`;

  // ── Runtime を読むだけ（Studio はロジックを持たない） ──
  const model = useMemo(() => buildRoofModelFromFaces(
    faces.map((f) => ({ vertices: f.vertices, pitch: f.pitch, attrs: { trade: '屋根工事', item: '屋根材' }, eaveEdgeIndex: f.eaveEdgeIndex })),
    { scale: SCALE },
  ), [faces]);
  const rq = useMemo(() => roofQuantities(model, SCALE), [model]);
  const fuzu = useMemo(() => roofDrawing(model), [model]);
  const V = useMemo(() => new Map(model.vertices.map((v) => [v.id, v])), [model]);

  const [drain, setDrain] = useState<History<DrainModel>>(() => initHistory(emptyDrainModel('DR-1', model.id)));
  const dm = drain.present;
  const dq = useMemo(() => drainQuantities(model, dm, SCALE), [model, dm]);
  // STEP5 Material Adapter：数量→Material IR(Intent)→Product（Rule Engine）。evidence は数量から継承＝要素と双方向。
  const mats = useMemo(() => compileMaterials([...rq, ...dq], defaultIntentCatalog, defaultProductCatalog), [rq, dq]);
  // STEP6：Execution（付属展開）を1回作り、そこから BOM(発注) と 見積(Cost Compiler) を投影＝Compiler of Compilers。
  const exec = useMemo(() => compileExecution([...rq, ...dq], defaultIntentCatalog, defaultProductCatalog, defaultAssemblyCatalog), [rq, dq]);
  const bom = useMemo(() => bomProjection(exec), [exec]);
  const est = useMemo(() => costCompiler(exampleCostKnowledge)(exec), [exec]);
  const sched = useMemo(() => scheduleCompile(exec, exampleScheduleKnowledge), [exec]);
  const insp = useMemo(() => qaCompile(exec, exampleQAProgram), [exec]);
  const carbon = useMemo(() => carbonCompile(exec, exampleCarbonProgram), [exec]);
  const res = useMemo(() => resourceCompile(exec, exampleResourceProgram), [exec]);
  const yen = (n: number) => '¥' + Math.round(n).toLocaleString();
  const ddraw = useMemo(() => drainDrawing(model, dm), [model, dm]);
  const issues = useMemo(() => validateDrainModel(model, dm), [model, dm]);
  const dispatchDrain = (cmd: DrainCommand) => setDrain((h) => histDispatch(h, drainReducer, cmd));

  const allDrops = dm.runs.flatMap((r) => r.drops.map((d) => ({ ...d, runId: r.id, eaveEdgeId: r.eaveEdgeId })));

  // ── highlight（Evidence 表示・Quantity↔要素の双方向） ──
  const highlightQuantity = (ev: { id: string }[]) => setHi(new Set(ev.map((e) => e.id)));
  const highlightElement = (id: string) => setHi(new Set([id]));
  const clearHi = () => setHi(new Set());

  // ── Roof 編集（従来どおり／Command化は後） ──
  const confirmFace = () => { if (draft.length >= 3) { setFaces((fs) => [...fs, { vertices: draft, pitch: 5, eaveEdgeIndex: bottomEdgeIndex(draft) }]); setDraft([]); setDrawingFace(false); } };
  const setPitch = (i: number, p: number) => setFaces((fs) => fs.map((f, j) => (j === i ? { ...f, pitch: p } : f)));
  const delFace = (i: number) => { setFaces((fs) => fs.filter((_, j) => j !== i)); clearHi(); };

  // ── 幾何ヘルパー（表示用） ──
  const eaveEnds = (eaveId: string): { a: Point; b: Point } | null => {
    const e = model.edges.find((x) => x.id === eaveId); if (!e) return null;
    const a = V.get(e.v[0]); const b = V.get(e.v[1]); return a && b ? { a, b } : null;
  };
  const projectOnEave = (eaveId: string, p: Point): { t: number; dist: number } | null => {
    const ends = eaveEnds(eaveId); if (!ends) return null;
    const abx = ends.b.x - ends.a.x, aby = ends.b.y - ends.a.y; const L2 = abx * abx + aby * aby || 1;
    let t = ((p.x - ends.a.x) * abx + (p.y - ends.a.y) * aby) / L2; t = Math.max(0, Math.min(1, t));
    const px = ends.a.x + abx * t, py = ends.a.y + aby * t;
    return { t: Math.round(t * 1000) / 1000, dist: Math.hypot(p.x - px, p.y - py) };
  };
  const dropPointById = (dropId: string): Point | null => {
    const d = allDrops.find((x) => x.id === dropId); if (!d) return null;
    const ends = eaveEnds(d.eaveEdgeId); if (!ends) return null;
    return { x: ends.a.x + (ends.b.x - ends.a.x) * d.position, y: ends.a.y + (ends.b.y - ends.a.y) * d.position };
  };

  // ── Gutter Edit の Command 発行（軒樋・集水器） ──
  const addOrSelectRun = (eaveId: string) => {
    const existing = dm.runs.find((r) => r.eaveEdgeId === eaveId);
    if (existing) { setActiveRun(existing.id); return; }
    const id = nid('gr');
    dispatchDrain({ type: 'AddRun', run: { id, eaveEdgeId: eaveId, flowDirection: flow, drops: [] } });
    setActiveRun(id);
  };
  const addGutterToAllEaves = () => {
    let last: string | null = null;
    for (const e of model.edges) if (edgeRole(model, e) === 'eave' && !dm.runs.some((r) => r.eaveEdgeId === e.id)) {
      const id = nid('gr'); last = id;
      dispatchDrain({ type: 'AddRun', run: { id, eaveEdgeId: e.id, flowDirection: flow, drops: [] } });
    }
    if (last) setActiveRun(last);
  };
  const addDrop = (position: number) => { if (activeRun) dispatchDrain({ type: 'AddDrop', runId: activeRun, drop: { id: nid('d'), position } }); };

  // ── 排水経路 Graph 編集（STEP4-B：Node追加／Edge追加） ──
  //   drop の Node（唯一の真実の始点）を確保して id を返す。無ければ AddNode を発行。
  const ensureDropNode = (dropId: string): string | null => {
    const existing = dm.graph.nodes.find((n) => n.dropId === dropId);
    if (existing) return existing.id;
    const pt = dropPointById(dropId); if (!pt) return null;
    const id = nid('n');
    dispatchDrain({ type: 'AddNode', node: { id, kind: 'drop', point: pt, dropId } });
    return id;
  };
  const startRoute = (dropId: string) => { const head = ensureDropNode(dropId); if (head) { setRouteHead(head); setNextKind('elbow'); } };
  const extendRoute = (pt: Point) => {
    if (!routeHead) return;
    const nodeId = nid('n');
    dispatchDrain({ type: 'AddNode', node: { id: nodeId, kind: nextKind as DrainNodeKind, point: pt } });
    dispatchDrain({ type: 'AddEdge', edge: { id: nid('e'), from: routeHead, to: nodeId } });
    if (nextKind === 'drain') { setRouteHead(null); } else setRouteHead(nodeId);
  };
  const endRoute = () => setRouteHead(null);
  // 竪樋↓：drop から真下へ排水（Node×2 + Edge×1 を一度に）
  const dropStraightDrain = (dropId: string) => {
    const head = ensureDropNode(dropId); const dp = dropPointById(dropId); if (!head || !dp) return;
    const nodeId = nid('n');
    dispatchDrain({ type: 'AddNode', node: { id: nodeId, kind: 'drain', point: { x: dp.x, y: dp.y + 150 } } });
    dispatchDrain({ type: 'AddEdge', edge: { id: nid('e'), from: head, to: nodeId } });
  };
  const resetDrain = () => { setDrain(initHistory(emptyDrainModel('DR-1', model.id))); setActiveRun(null); setSelDrop(null); setRouteHead(null); };

  // ── 保存・開く（Model だけを保存。ID は逐語保存＝Evidence が切れない） ──
  //   埋め込み時（iraka-report）は host（?projectId 連携）経由で案件へ保存/復元。無ければファイル（standalone）。
  const loadFromJson = (text: string): boolean => {
    try {
      const doc = parseDocument(text);
      setFaces(doc.faces);
      setDrain(initHistory(doc.drain));       // 復元＝新しい履歴の起点（ID逐語）
      idc.current = maxIdSuffix(doc.drain) + 1; // 新規採番を既存 ID の次から続ける
      setActiveRun(null); setSelDrop(null); setRouteHead(null); clearHi();
      setSavedAt(doc.savedAt ?? null); setLoadError(null);
      return true;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };
  const onSave = () => {
    const stamp = new Date().toISOString();
    const json = serializeDocument(faces, dm, stamp);
    const host = estimationHost();
    if (host?.projectId && typeof host.saveModel === 'function') { // 埋め込み：案件へ保存
      host.saveModel(json).then(() => { setSavedAt(stamp); setLoadError(null); })
        .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
      return;
    }
    // standalone：ファイルへ保存
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = `甍AI-拾い-${stamp.slice(0, 10)}.iraka.json`; a.click();
    URL.revokeObjectURL(url);
    setSavedAt(stamp); setLoadError(null);
  };
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try { loadFromJson(await file.text()); } finally { e.target.value = ''; }
  };
  // 埋め込み時：起動時に案件から復元（host があれば）
  useEffect(() => {
    const host = estimationHost();
    if (host?.projectId && typeof host.loadModel === 'function') {
      host.loadModel().then((json) => { if (json) loadFromJson(json); }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const savedLabel = savedAt ? `💾 最終保存 ${new Date(savedAt).toLocaleString('ja-JP', { hour: '2-digit', minute: '2-digit', month: 'numeric', day: 'numeric' })}` : '未保存';

  const onStageClick = (e: any) => {
    const p = e.target.getStage().getPointerPosition(); if (!p) return;
    const pt = { x: Math.round(p.x), y: Math.round(p.y) };
    if (mode === 'select' && drawingFace) { setDraft((d) => [...d, pt]); return; }
    if (mode === 'gutter') {
      if (routeHead) { extendRoute(pt); return; }               // 経路構築中：クリックで Node+Edge
      // 既存の集水器の近く（≤12px）をクリック＝選択（追加より優先。経路の始点にできる）
      const near = allDrops.find((d) => { const dp = dropPointById(d.id); return dp && Math.hypot(dp.x - pt.x, dp.y - pt.y) <= 12; });
      if (near) { setSelDrop(near.id); setActiveRun(near.runId); return; }
      if (activeRun) {
        const run = dm.runs.find((r) => r.id === activeRun);
        if (run) { const pr = projectOnEave(run.eaveEdgeId, pt); if (pr && pr.dist < 16) { dispatchDrain({ type: 'AddDrop', runId: activeRun, drop: { id: nid('d'), position: pr.t } }); return; } }
      }
    }
  };

  const flat = (pts: Point[]) => pts.flatMap((p) => [p.x, p.y]);
  const b = fuzu.bounds; const vbPad = 30;
  const vb = `${b.minX - vbPad} ${b.minY - vbPad} ${(b.maxX - b.minX) + vbPad * 2} ${(b.maxY - b.minY) + vbPad * 2}`;
  const errCount = issues.filter((i) => i.severity === 'error').length;
  const dim = (id: string) => hi.size > 0 && !hi.has(id);

  return (
    <div className="rs">
      <header className="rs-head">
        <strong>甍AI Engine Studio</strong>
        <span>Runtime v1.0 / Engine: Roof + Drain</span>
        <span className="rs-type">屋根: <b>{roofType(model) ? TYPE_LABEL[roofType(model)!] : '—'}</b></span>
        <span className="rs-sp" />
        {/* 編集モード */}
        <span className="rs-modes">
          {(['select', 'gutter', 'measure'] as Mode[]).map((m) => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => { setMode(m); setActiveRun(null); setSelDrop(null); setRouteHead(null); clearHi(); }}>
              {m === 'select' ? 'Selection' : m === 'gutter' ? 'Gutter Edit' : 'Measure'}
            </button>
          ))}
        </span>
        {/* 保存・開く（Persistence Standard：語彙は「保存 / 開く」のみ） */}
        <span className="rs-doc">
          <button onClick={onSave}>💾 保存</button>
          <button onClick={() => fileRef.current?.click()}>📂 開く</button>
          <span className="rs-saved">{savedLabel}</span>
          <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={onFile} />
        </span>
      </header>
      {loadError && <div className="rs-loaderr">⚠ {loadError}<button onClick={() => setLoadError(null)}>×</button></div>}

      {/* サブツールバー（モード依存） */}
      <div className="rs-sub">
        {mode === 'select' && <>
          <button onClick={() => { setFaces(preset('gable')); }}>切妻</button>
          <button onClick={() => { setFaces(preset('hipped')); }}>方形</button>
          <button onClick={() => { setFaces(preset('shed')); }}>片流れ</button>
          <button className={drawingFace ? 'on' : ''} onClick={() => { setDrawingFace(true); setDraft([]); }}>＋屋根面を描く</button>
          <button onClick={confirmFace} disabled={draft.length < 3}>確定</button>
          <button onClick={() => setFaces([])}>屋根全消去</button>
        </>}
        {mode === 'gutter' && <>
          <span className="rs-lbl">流れ:</span>
          {(['left', 'right', 'both'] as FlowDirection[]).map((f) => (
            <button key={f} className={flow === f ? 'on' : ''} onClick={() => setFlow(f)}>{f === 'left' ? '左' : f === 'right' ? '右' : '両'}</button>
          ))}
          <button onClick={addGutterToAllEaves}>全軒に軒樋</button>
          <span className="rs-lbl">| 軒樋 {activeRun ?? '—'}:</span>
          <button disabled={!activeRun} onClick={() => addDrop(0)}>集水器左</button>
          <button disabled={!activeRun} onClick={() => addDrop(0.5)}>中央</button>
          <button disabled={!activeRun} onClick={() => addDrop(1)}>右</button>
          <span className="rs-sp2" />
          {/* 経路編集（Node/Edge Graph） */}
          {!routeHead && <>
            <button disabled={!selDrop} onClick={() => selDrop && startRoute(selDrop)}>経路を描く▶</button>
            <button disabled={!selDrop} onClick={() => selDrop && dropStraightDrain(selDrop)}>竪樋↓排水</button>
          </>}
          {routeHead && <>
            <span className="rs-lbl rs-routing">経路構築中 →</span>
            {(['elbow', 'drain'] as const).map((k) => (
              <button key={k} className={nextKind === k ? 'on' : ''} onClick={() => setNextKind(k)}>{k === 'elbow' ? '次:エルボ' : '次:排水(終端)'}</button>
            ))}
            <button onClick={endRoute}>経路を終える</button>
          </>}
          <span className="rs-sp2" />
          <button disabled={!canUndo(drain)} onClick={() => setDrain(undo)}>↶ Undo</button>
          <button disabled={!canRedo(drain)} onClick={() => setDrain(redo)}>↷ Redo</button>
          <button onClick={resetDrain}>雨樋全消去</button>
        </>}
        {mode === 'measure' && <span className="rs-lbl">Measure（計測）は次段。今は Selection / Gutter Edit を。</span>}
      </div>

      <div className="rs-body">
        {/* 左: Face / Edge / 軒樋 / 経路 一覧 */}
        <aside className="rs-left">
          <h4>Face（{model.faces.length}）</h4>
          {model.faces.map((f, i) => (
            <div key={f.id} className={'rs-item' + (hi.has(f.id) ? ' hi' : '')} onMouseEnter={() => highlightElement(f.id)} onMouseLeave={clearHi}>
              <span>{f.id} · {(faceArea(model, f) / (SCALE * SCALE)).toFixed(2)}㎡</span>
              <span className="rs-row-r"><input type="number" step={0.5} min={0} value={f.slope.pitch ?? 0} onChange={(e) => setPitch(i, Number(e.target.value))} />寸
                <button className="rs-del" onClick={() => delFace(i)}>✕</button></span>
            </div>
          ))}
          <h4>Edge（{model.edges.length}）</h4>
          {model.edges.map((e) => {
            const role = edgeRole(model, e);
            return (
              <div key={e.id} className={'rs-item' + (hi.has(e.id) ? ' hi' : '')} onMouseEnter={() => highlightElement(e.id)} onMouseLeave={clearHi}
                onClick={() => { if (mode === 'gutter' && role === 'eave') addOrSelectRun(e.id); }}>
                <span><b style={{ color: role ? ROLE_COLOR[role] : '#888' }}>{role ? ROLE_LABEL[role] : '—'}</b> {e.id}</span>
                <span className="rs-row-r">{(edgeLength(model, e) / SCALE).toFixed(2)}m</span>
              </div>
            );
          })}
          {dm.runs.length > 0 && <>
            <h4>軒樋（{dm.runs.length}）</h4>
            {dm.runs.map((r) => (
              <div key={r.id} className={'rs-item' + (activeRun === r.id ? ' hi' : '')} onClick={() => setActiveRun(r.id)}>
                <span><b style={{ color: GUTTER }}>{r.id}</b> {r.flowDirection}</span>
                <span className="rs-row-r">集水器{r.drops.length}</span>
              </div>
            ))}
          </>}
          {(dm.graph.nodes.length > 0 || dm.graph.edges.length > 0) && <>
            <h4>経路 Graph（Node {dm.graph.nodes.length} / Edge {dm.graph.edges.length}）</h4>
            {ddraw.segments.map((s) => (
              <div key={s.edgeId} className={'rs-item' + (hi.has(s.edgeId) ? ' hi' : '')} onMouseEnter={() => highlightElement(s.edgeId)} onMouseLeave={clearHi}>
                <span><b style={{ color: s.kind === 'downspout' ? DOWNSPOUT : CONNECTOR }}>{s.kind === 'downspout' ? '竪樋' : '呼び樋'}</b> {s.edgeId}</span>
                <span className="rs-row-r">{Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) / SCALE > 0 ? (Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) / SCALE).toFixed(2) : ''}m</span>
              </div>
            ))}
          </>}
        </aside>

        {/* 中央: キャンバス（Roof ＋ Drain オーバーレイ） */}
        <div className="rs-canvas">
          <Stage width={W} height={H} onMouseDown={onStageClick}>
            <Layer>
              {model.faces.map((f) => <Line key={f.id} points={flat(facePolygon(model, f))} closed
                fill={hi.has(f.id) ? 'rgba(232,89,12,0.22)' : 'rgba(31,78,121,0.06)'} stroke="#c7d0da" strokeWidth={1} />)}
              {model.edges.map((e) => {
                const role = edgeRole(model, e); const a = V.get(e.v[0]); const b2 = V.get(e.v[1]); if (!a || !b2) return null;
                const on = hi.has(e.id);
                return <Line key={e.id} points={[a.x, a.y, b2.x, b2.y]} stroke={role ? ROLE_COLOR[role] : '#888'} strokeWidth={on ? 6 : 3}
                  opacity={on || hi.size === 0 ? 1 : 0.35}
                  onMouseDown={(ev) => { ev.cancelBubble = true; if (mode === 'gutter' && role === 'eave') addOrSelectRun(e.id); else highlightElement(e.id); }} />;
              })}
              {/* Drain overlay: 軒樋 → 流れ → 経路Segment → Node → 集水器 */}
              {ddraw.gutters.map((g) => <Line key={g.runId} points={[g.a.x, g.a.y, g.b.x, g.b.y]} stroke={GUTTER}
                strokeWidth={activeRun === g.runId ? 8 : 5} opacity={0.85} onMouseDown={(ev) => { ev.cancelBubble = true; setActiveRun(g.runId); }} />)}
              {ddraw.flows.map((fl, i) => <Arrow key={'fl' + i} points={[fl.from.x, fl.from.y, fl.to.x, fl.to.y]} stroke={FLOW} fill={FLOW} strokeWidth={2} pointerLength={7} pointerWidth={7} />)}
              {ddraw.segments.map((s) => <Line key={s.edgeId} points={[s.a.x, s.a.y, s.b.x, s.b.y]}
                stroke={s.kind === 'downspout' ? DOWNSPOUT : CONNECTOR} strokeWidth={hi.has(s.edgeId) ? 7 : 4} opacity={dim(s.edgeId) ? 0.35 : 1}
                onMouseDown={(ev) => { ev.cancelBubble = true; highlightElement(s.edgeId); }} />)}
              {ddraw.nodes.filter((n) => n.kind !== 'drop').map((n) => (n.kind === 'elbow'
                ? <Rect key={n.nodeId} x={n.point.x - 5} y={n.point.y - 5} width={10} height={10} rotation={45} fill={ELBOW}
                    stroke={hi.has(n.nodeId) ? '#000' : '#fff'} strokeWidth={hi.has(n.nodeId) ? 2 : 1} opacity={dim(n.nodeId) ? 0.35 : 1}
                    onMouseDown={(ev) => { ev.cancelBubble = true; highlightElement(n.nodeId); }} />
                : <Circle key={n.nodeId} x={n.point.x} y={n.point.y} radius={hi.has(n.nodeId) ? 8 : 6} fill={DRAINC}
                    stroke={hi.has(n.nodeId) ? '#000' : '#fff'} strokeWidth={hi.has(n.nodeId) ? 2 : 1} opacity={dim(n.nodeId) ? 0.35 : 1}
                    onMouseDown={(ev) => { ev.cancelBubble = true; highlightElement(n.nodeId); }} />))}
              {ddraw.drops.map((d) => <Circle key={d.dropId} x={d.point.x} y={d.point.y} radius={selDrop === d.dropId ? 8 : 6}
                fill={DROP} stroke={selDrop === d.dropId || routeHead ? '#fff' : undefined} strokeWidth={2}
                draggable={!routeHead}
                onMouseDown={(ev) => { ev.cancelBubble = true; setSelDrop(d.dropId); }}
                onDragEnd={(ev) => {
                  // ドラッグ確定時に MoveDrop を1回だけ dispatch（ドラッグ中は Konva の一時表示＝Studio状態）
                  const info = allDrops.find((x) => x.id === d.dropId);
                  if (info) { const pr = projectOnEave(info.eaveEdgeId, { x: ev.target.x(), y: ev.target.y() }); if (pr) dispatchDrain({ type: 'MoveDrop', dropId: d.dropId, position: pr.t }); }
                }} />)}
              {/* 経路構築中：head から次点への予告線は出さず、head を強調 */}
              {routeHead && (() => { const hn = dm.graph.nodes.find((n) => n.id === routeHead); return hn
                ? <Circle key="head" x={hn.point.x} y={hn.point.y} radius={10} stroke={ELBOW} strokeWidth={2} dash={[3, 3]} /> : null; })()}
              {draft.length > 0 && <Line points={flat(draft)} stroke="#2e74b5" strokeWidth={2} dash={[6, 4]} />}
              {model.edges.map((e) => { const role = edgeRole(model, e); if (!role) return null; const a = V.get(e.v[0]); const b2 = V.get(e.v[1]); if (!a || !b2) return null;
                return <Text key={'t' + e.id} x={(a.x + b2.x) / 2 - 8} y={(a.y + b2.y) / 2 - 8} text={ROLE_LABEL[role]} fontSize={11} fill={ROLE_COLOR[role]} />; })}
            </Layer>
          </Stage>
          <div className="rs-hint">
            {mode === 'gutter' ? (routeHead
              ? '経路構築中：空きをクリックで途中点を追加（次:エルボ/排水を切替）。「排水(終端)」で終了。'
              : '軒(緑)クリック→軒樋／軒樋を選び軒上クリック→集水器／集水器を選び「経路を描く」→クリックで竪樋・エルボ・呼び樋・排水。（Undo/Redo可）')
              : mode === 'select' ? 'プリセット/描画で屋根を編集。Gutter Edit で雨樋へ。' : 'Measure は次段。'}
          </div>
        </div>

        {/* 右: 数量（Evidence付き）＋ Validator ＋ 伏図 */}
        <aside className="rs-right">
          <h4>屋根 数量</h4>
          <table className="rs-qty"><tbody>
            {rq.map((q) => <tr key={q.key} className={[...hi].some((id) => q.evidence.find((e) => e.id === id)) ? 'hi' : ''}
              onMouseEnter={() => highlightQuantity(q.evidence)} onMouseLeave={clearHi}>
              <td>{q.label}</td><td className="rs-val">{q.value.toFixed(2)}<small> {q.unit}</small></td>
              <td className="rs-basis">{(q.evidence[0]?.kind === 'face' ? 'Face' : 'Edge')}×{q.evidence.length}</td></tr>)}
          </tbody></table>

          <h4 className="rs-mt">雨樋 数量 <small>（Evidence付き）</small></h4>
          <table className="rs-qty"><tbody>
            {dq.length === 0 && <tr><td colSpan={3} className="rs-empty">Gutter Edit で軒樋を配置</td></tr>}
            {dq.map((q) => <tr key={q.key} className={[...hi].some((id) => q.evidence.find((e) => e.id === id)) ? 'hi' : ''}
              onMouseEnter={() => highlightQuantity(q.evidence)} onMouseLeave={clearHi}>
              <td>{q.label}</td><td className="rs-val">{q.value.toFixed(2)}<small> {q.unit}</small></td>
              <td className="rs-basis">{q.evidence[0]?.kind === 'segment' ? 'Seg' : q.evidence[0]?.kind === 'node' ? 'Node' : q.evidence[0]?.kind === 'drop' ? 'Drop' : 'Run'}×{q.evidence.length}</td></tr>)}
          </tbody></table>

          <h4 className="rs-mt">部材 <small>（数量→Intent→Product / Rule Engine）</small></h4>
          <table className="rs-qty"><tbody>
            {mats.length === 0 && <tr><td colSpan={3} className="rs-empty">数量が出れば部材へ射影</td></tr>}
            {mats.map((m, i) => <tr key={m.kind + i} className={[...hi].some((id) => m.evidence.find((e) => e.id === id)) ? 'hi' : ''}
              onMouseEnter={() => highlightQuantity(m.evidence)} onMouseLeave={clearHi}>
              <td>{m.product ? m.product.name : m.kind + '（未解決）'}</td>
              <td className="rs-val">{Number.isInteger(m.qty) ? m.qty : m.qty.toFixed(2)}<small> {m.unit}</small></td>
              <td className="rs-basis">{m.product ? m.product.sku : 'IR:' + m.kind}</td></tr>)}
          </tbody></table>

          <h4 className="rs-mt">発注（BOM・付属展開）<small>（同じ Execution の Projection）</small></h4>
          <table className="rs-qty"><tbody>
            {bom.length === 0 && <tr><td colSpan={3} className="rs-empty">数量が出れば発注へ</td></tr>}
            {bom.map((l, i) => <tr key={(l.sku ?? l.kind) + i} className={[...hi].some((id) => l.evidence.find((e) => e.id === id)) ? 'hi' : ''}
              onMouseEnter={() => highlightQuantity(l.evidence)} onMouseLeave={clearHi}>
              <td>{l.name}</td>
              <td className="rs-val">{Number.isInteger(l.qty) ? l.qty : l.qty.toFixed(2)}<small> {l.unit}</small></td>
              <td className="rs-basis">{l.sku ?? '未解決'}</td></tr>)}
          </tbody></table>

          <h4 className="rs-mt">見積（Cost Compiler・例示単価）<small>（材料→労務→間接）</small></h4>
          <table className="rs-qty"><tbody>
            <tr><td>材料費</td><td className="rs-val">{yen(est.materialCost)}</td><td className="rs-basis">BOM×単価</td></tr>
            <tr><td>労務費</td><td className="rs-val">{yen(est.laborCost)}</td><td className="rs-basis">歩掛×人工</td></tr>
            <tr><td>間接費</td><td className="rs-val">{yen(est.indirectCost)}</td><td className="rs-basis">×0.15</td></tr>
            <tr><td><b>合計</b></td><td className="rs-val"><b>{yen(est.total)}</b></td><td className="rs-basis">Estimate</td></tr>
          </tbody></table>

          <h4 className="rs-mt">工程（Schedule Compiler・例示）<small>（同じ Execution・CPM）</small></h4>
          <table className="rs-qty"><tbody>
            <tr><td>総工期</td><td className="rs-val">{sched.totalDuration.toFixed(2)}<small> 人日</small></td><td className="rs-basis">CPM</td></tr>
            <tr><td>クリティカル</td><td className="rs-val">{sched.criticalPath.length}<small> / {sched.tasks.length} 工程</small></td><td className="rs-basis">float0</td></tr>
          </tbody></table>

          <h4 className="rs-mt">品質・CO₂ <small>（QA=Rule Engine / Carbon=多段集約・同じ Execution）</small></h4>
          <table className="rs-qty"><tbody>
            <tr><td>品質（QA）</td><td className="rs-val">{insp.passCount}/{insp.checks.length}<small> pass</small></td><td className="rs-basis">{insp.allPass ? 'OK' : 'NG'}</td></tr>
            <tr><td>CO₂ 合計</td><td className="rs-val">{carbon.total.toFixed(1)}<small> kg</small></td><td className="rs-basis">材料+輸送+施工</td></tr>
            <tr><td>体制（Resource）</td><td className="rs-val">{res.totalLabor.toFixed(2)}<small> 人工</small></td><td className="rs-basis">{res.trades.length}職種</td></tr>
          </tbody></table>

          <h4 className="rs-mt">Validator {errCount > 0 ? <span className="rs-err">● {errCount} error</span> : <span className="rs-ok">● OK</span>}</h4>
          <div className="rs-valid">
            {issues.length === 0 && <div className="rs-empty">問題なし</div>}
            {issues.map((iss, i) => <div key={i} className={'rs-iss ' + iss.severity} onMouseEnter={() => highlightQuantity(iss.evidence)} onMouseLeave={clearHi}>
              <b>{iss.code}</b> {iss.message}</div>)}
          </div>

          <h4 className="rs-fuzu-h">屋根伏図（再構築）</h4>
          <svg className="rs-fuzu" viewBox={vb} preserveAspectRatio="xMidYMid meet">
            {fuzu.edges.map((e) => { const on = hi.has(e.edgeId); const col = e.role ? ROLE_COLOR[e.role] : '#888';
              return <line key={e.edgeId} x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} stroke={col} strokeWidth={(e.role === 'ridge' ? 4 : 3) + (on ? 3 : 0)}
                vectorEffect="non-scaling-stroke" strokeDasharray={e.role === 'valley' ? '6 4' : undefined} opacity={on || hi.size === 0 ? 1 : 0.3}
                style={{ cursor: 'pointer' }} onClick={() => highlightElement(e.edgeId)} />; })}
            {ddraw.gutters.map((g) => <line key={g.runId} x1={g.a.x} y1={g.a.y} x2={g.b.x} y2={g.b.y} stroke={GUTTER} strokeWidth={5} vectorEffect="non-scaling-stroke" opacity={0.8} />)}
            {ddraw.segments.map((s) => <line key={s.edgeId} x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y}
              stroke={s.kind === 'downspout' ? DOWNSPOUT : CONNECTOR} strokeWidth={hi.has(s.edgeId) ? 5 : 3} vectorEffect="non-scaling-stroke" opacity={dim(s.edgeId) ? 0.3 : 0.9} />)}
            {ddraw.nodes.filter((n) => n.kind === 'elbow').map((n) => <rect key={n.nodeId} x={n.point.x - 3} y={n.point.y - 3} width={6} height={6} fill={ELBOW} vectorEffect="non-scaling-stroke" />)}
            {ddraw.nodes.filter((n) => n.kind === 'drain').map((n) => <circle key={n.nodeId} cx={n.point.x} cy={n.point.y} r={4} fill={DRAINC} vectorEffect="non-scaling-stroke" />)}
            {ddraw.drops.map((d) => <circle key={d.dropId} cx={d.point.x} cy={d.point.y} r={5} fill={DROP} />)}
          </svg>
        </aside>
      </div>
    </div>
  );
}
