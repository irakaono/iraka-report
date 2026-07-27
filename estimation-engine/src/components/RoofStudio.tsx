// 甍AI 積算スタジオ（屋根 + 雨樋）— Engine Runtime v1.0 の最初のクライアント。
//   ★Studio は薄く保つ：UI は Command を dispatch し、History/Validator/Drawing/Quantity を「表示」するだけ。
//     Reducer / Validator / Drawing / Quantity のロジックは一切持たない（全部 Runtime を呼ぶ）。
//   ★排水経路は Node/Edge Graph が唯一の真実。Studio は Graph を Polyline として編集・表示するだけ。
//   モード: 屋根を描く / 雨樋を描く / 計測。雨樋は 軒樋→集水器→（竪樋→エルボ→呼び樋→排水）を Command で編集。
//   ★入口で図面を入れると、屋根プリセット＋雨樋の自動提案で数量を即座に表示（人が上から修正して確定）。
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Stage, Layer, Line, Circle, Rect, Text, Arrow, Group, Image as KonvaImage } from 'react-konva';
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
import { calibrateFrom2Points, DEV_PX_PER_METER } from '../geometry/calibration';
import type { Calibration } from '../geometry/calibration';
import AcceptancePanel from './AcceptancePanel';
import { buildEstimate } from '../geometry/estimateExport';
import type { GutterProgram } from '../geometry/acceptance';
import { buildQuotationWorkbook } from '../geometry/quotationXlsx';
import { autoProposeGutter } from '../geometry/autoPropose';
import withdomGutter from '../../knowledge/programs/withdom-saitama.gutter.json';
import withdomRoof from '../../knowledge/programs/withdom-saitama.roof.json';

// 見積書 Excel は会社書式に完全一致させるため ExcelJS を使用（罫線/結合/数値書式）。必要時だけ CDN から読む。
const EXCELJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
// UMD スクリプトを一度だけ読み込み、window.ExcelJS を返す（単一HTMLビルドでも動く）。
function loadExcelJS(): Promise<any> {
  const w = window as any;
  if (w.ExcelJS) return Promise.resolve(w.ExcelJS);
  return new Promise((resolve, reject) => {
    const exist = document.querySelector('script[data-exceljs]') as HTMLScriptElement | null;
    const done = () => (w.ExcelJS ? resolve(w.ExcelJS) : reject(new Error('ExcelJS 読み込み失敗')));
    if (exist) { exist.addEventListener('load', done); exist.addEventListener('error', () => reject(new Error('ExcelJS 読み込み失敗'))); return; }
    const s = document.createElement('script');
    s.src = EXCELJS_CDN; s.async = true; s.setAttribute('data-exceljs', '1');
    s.onload = done; s.onerror = () => reject(new Error('ExcelJS 読み込み失敗（オフライン時は不可）'));
    document.head.appendChild(s);
  });
}

// iraka-report 埋め込み時のホスト（js/estimation-bridge.js が ?projectId 連携で window にセット）。無ければ standalone。
interface EstimationRevisionRec {
  id: string; sequence: number; createdAt: string; note?: string;
  geometryRevisionId: string; geometrySequence?: number; quotationSnapshot?: unknown; status?: string;
}
// 採用版の判断（原則19：判断は Estimation ではなく Project 側の Decision に残す）。
// project.extensions.estimationDecision に { adoptedEstimationId, decidedBy, decidedAt, reason } として保存される。
interface EstimationDecision {
  adoptedEstimationId: string;   // どの版を採用したか（EstimationRevisionRec.id）
  decidedBy?: string;            // 誰が
  decidedAt: string;             // いつ（ISO8601）
  reason?: string;               // なぜ
}
interface EstimationHost {
  projectId?: string | null;
  loadModel: () => Promise<string | null>;
  saveModel: (json: string) => Promise<void>;
  // v5 履歴 API（無ければ standalone 扱い）
  hasHistory?: boolean;
  listRevisions?: () => Promise<EstimationRevisionRec[]>;
  saveRevision?: (payload: { model: string; quantitySnapshot?: unknown; quotationSnapshot?: unknown; note?: string; createdBy?: string }) => Promise<{ estimation: EstimationRevisionRec; geometryReused?: boolean }>;
  openRevision?: (geometryRevisionId: string) => Promise<string | null>;
  // Phase A#2 採用版管理：判断は Project 側に持つ（原則19）。
  getDecision?: () => Promise<EstimationDecision | null>;
  setDecision?: (d: EstimationDecision) => Promise<EstimationDecision>;
}
function estimationHost(): EstimationHost | undefined {
  return typeof window !== 'undefined'
    ? (window as unknown as { IrakaEstimationHost?: EstimationHost }).IrakaEstimationHost
    : undefined;
}

const W = 720, H = 560;
const ROLE_COLOR: Record<string, string> = { ridge: '#e03131', hip: '#e8590c', valley: '#1971c2', eave: '#2f9e44', gable: '#7048e8' };
const ROLE_LABEL: Record<string, string> = { ridge: '棟', hip: '隅棟', valley: '谷', eave: '軒', gable: 'ケラバ' };
const TYPE_LABEL: Record<string, string> = { shed: '片流れ', gable: '切妻', hip: '寄棟/方形', saltbox: '招き', lean_to: '差し掛け' };
const GUTTER = '#1971c2', DROP = '#e8590c', FLOW = '#74c0fc';
const DOWNSPOUT = '#495057', CONNECTOR = '#0ca678', ELBOW = '#f08c00', DRAINC = '#c2255c';

interface FaceInput { vertices: Point[]; pitch: number; eaveEdgeIndex: number }
type Mode = 'select' | 'gutter' | 'measure' | 'calibrate';

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

interface RoofStudioProps {
  planSrc?: string | null;        // 平面図（背景トレース用・入口画面から）
  elevationSrc?: string | null;   // 立面図
  onBackToDrawings?: () => void;  // 入口（図面ドロップ）へ戻る
}

export default function RoofStudio({ planSrc, elevationSrc, onBackToDrawings }: RoofStudioProps = {}) {
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
  // ── 図面背景（トレース）：平面図/立面図を Konva Image でキャンバス下地に。人が上からなぞって Geometry を確定する。 ──
  const [planImg, setPlanImg] = useState<HTMLImageElement | null>(null);
  const [elevImg, setElevImg] = useState<HTMLImageElement | null>(null);
  const [bgWhich, setBgWhich] = useState<'plan' | 'elevation'>('plan');
  const [bgOn, setBgOn] = useState<boolean>(true);
  const [bgOpacity, setBgOpacity] = useState<number>(0.45);
  const [bgScale, setBgScale] = useState<number>(1);
  const [bgPos, setBgPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [bgAdjust, setBgAdjust] = useState<boolean>(false);
  const fitImage = (img: HTMLImageElement) => {
    const s = Math.min(W / img.width, H / img.height) || 1;
    setBgScale(s);
    setBgPos({ x: (W - img.width * s) / 2, y: (H - img.height * s) / 2 });
  };
  // 画像ロード（src→HTMLImageElement）。読めたら該当が現在背景ならフィット。
  useEffect(() => {
    if (!planSrc) { setPlanImg(null); return; }
    const img = new Image();
    img.onload = () => { setPlanImg(img); if (bgWhich === 'plan') fitImage(img); };
    img.src = planSrc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planSrc]);
  useEffect(() => {
    if (!elevationSrc) { setElevImg(null); return; }
    const img = new Image();
    img.onload = () => { setElevImg(img); if (bgWhich === 'elevation') fitImage(img); };
    img.src = elevationSrc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elevationSrc]);
  const bgImg = bgWhich === 'elevation' ? elevImg : planImg;
  const switchBg = (which: 'plan' | 'elevation') => {
    setBgWhich(which);
    const img = which === 'elevation' ? elevImg : planImg;
    if (img) fitImage(img);
  };
  // ── スケール較正（L0.5）：px→m。較正が無ければ開発用 DEV_PX_PER_METER。全数量はこの scale で実寸化。 ──
  const [scale, setScale] = useState<number>(DEV_PX_PER_METER);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [calPts, setCalPts] = useState<Point[]>([]); // 較正クリック中の2点（px）
  const [knownLen, setKnownLen] = useState<string>('0.91'); // 既知実寸(m)。既定=通り芯1マス0.91m
  const [showAcceptance, setShowAcceptance] = useState<boolean>(false); // 検証パネル
  // ── AIナビ（初回ガイド）：①図面 ②縮尺 ③屋根 ④数量 ⑤見積 の現在地を常時表示し、次の一手だけ案内する。 ──
  const [roofDone, setRoofDone] = useState<boolean>(false);   // ③屋根なぞり完了（人が「これでOK」）＝下書きが確定図形になる
  const [excelDone, setExcelDone] = useState<boolean>(false); // ⑤見積書 作成済み
  const [guideOn, setGuideOn] = useState<boolean>(true);      // ガイド表示ON/OFF
  const [advanced, setAdvanced] = useState<boolean>(false);   // 詳細モード（上部ツールバーを畳む/展開）
  const [showIntro, setShowIntro] = useState<boolean>(true);  // 初回だけ画面中央に指示を重ねる
  const [roofFormChosen, setRoofFormChosen] = useState<boolean>(false); // AIナビ③で屋根の形テンプレを選んだか（「角を合わせる」案内の出し分け）
  const [cursorPt, setCursorPt] = useState<Point | null>(null); // 縮尺合わせ中：カーソル追従ヒント用
  const [toast, setToast] = useState<string | null>(null);      // 成功トースト（✓縮尺を設定しました 等）
  const [showHistory, setShowHistory] = useState<boolean>(false);       // 積算履歴パネル（案件埋め込み時のみ）
  const [revisions, setRevisions] = useState<EstimationRevisionRec[]>([]); // 案件の Estimation 履歴（001/002…）
  const [decision, setDecisionState] = useState<EstimationDecision | null>(null); // 採用版の判断（Project=SSOT・原則19）
  const [adoptDraft, setAdoptDraft] = useState<{ id: string; by: string; reason: string } | null>(null); // 「採用」入力中（誰が・なぜ）
  const hasHistory = !!estimationHost()?.hasHistory;                     // 履歴機能が使える（?projectId 埋め込み）か
  const applyCalibration = (p1: Point, p2: Point) => {
    const m = Number(knownLen);
    if (!(m > 0)) { setLoadError('既知寸法(m)を正の数で入力してください'); return; }
    try {
      const cal = calibrateFrom2Points({ id: `cal-${idc.current++}`, drawingId: bgWhich, p1, p2, sourceLength: m });
      setCalibration(cal); setScale(cal.pxPerMeter); setCalPts([]); setLoadError(null);
      setCursorPt(null);
      setToast('✓ 縮尺を設定しました'); window.setTimeout(() => setToast(null), 1100); // 成功体験を一瞬見せる
      setMode('select'); setShowIntro(false); // 縮尺確定 → 自動で「屋根をなぞる」へ

    } catch (err) { setLoadError(err instanceof Error ? err.message : String(err)); }
  };
  const nid = (p: string) => `${p}-${idc.current++}`;
  // 縮尺プリセット：使う寸法(m)をワンタップ→縮尺合わせモードへ（あとは図面上で両端2点クリックで確定）。
  const pickScale = (meters: number) => {
    setKnownLen(String(meters));
    setMode('calibrate'); setActiveRun(null); setSelDrop(null); setRouteHead(null); setCalPts([]); clearHi();
    if (!bgOn) setBgOn(true); setShowIntro(false);
  };

  // ── Runtime を読むだけ（Studio はロジックを持たない） ──
  const model = useMemo(() => buildRoofModelFromFaces(
    faces.map((f) => ({ vertices: f.vertices, pitch: f.pitch, attrs: { trade: '屋根工事', item: '屋根材' }, eaveEdgeIndex: f.eaveEdgeIndex })),
    { scale },
  ), [faces, scale]);
  const rq = useMemo(() => roofQuantities(model, scale), [model, scale]);
  const fuzu = useMemo(() => roofDrawing(model), [model]);
  const V = useMemo(() => new Map(model.vertices.map((v) => [v.id, v])), [model]);

  const [drain, setDrain] = useState<History<DrainModel>>(() => initHistory(emptyDrainModel('DR-1', model.id)));
  // ── 自動積算（初回のみ）：図面を入れて開くと、屋根プリセットの軒から雨樋を自動提案し、雨樋数量を即表示。
  //    人はこの下地を上からなぞって修正する（＝AIが下書き→人が確定）。手拾いで空にしたい場合は「経路クリア」。
  const autoSeeded = useRef(false);
  useEffect(() => {
    if (autoSeeded.current) return;
    autoSeeded.current = true;
    const proposal = autoProposeGutter(model);
    if (proposal.dropCount > 0) { setDrain(initHistory(proposal.model)); idc.current = maxIdSuffix(proposal.model) + 1; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dm = drain.present;
  const dq = useMemo(() => drainQuantities(model, dm, scale), [model, dm, scale]);
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
  // 屋根の形が変わったら、その形の軒から雨樋を組み直す（形を選び直しても前の雨樋が残らない＝EaveNotFound防止）。
  const reseedDrainFor = (newFaces: FaceInput[]) => {
    const m = buildRoofModelFromFaces(
      newFaces.map((f) => ({ vertices: f.vertices, pitch: f.pitch, attrs: { trade: '屋根工事', item: '屋根材' }, eaveEdgeIndex: f.eaveEdgeIndex })),
      { scale },
    );
    const proposal = autoProposeGutter(m);
    const dModel = proposal.dropCount > 0 ? proposal.model : emptyDrainModel('DR-1', m.id);
    setDrain(initHistory(dModel));
    idc.current = Math.max(idc.current, maxIdSuffix(dModel) + 1);
  };
  // AIナビ③「形から始める」：屋根の形テンプレを置く（平面図の上に生成→人が角をドラッグして合わせる）。雨樋も組み直す。
  const chooseForm = (name: 'gable' | 'hipped' | 'shed') => {
    const nf = preset(name);
    setFaces(nf);
    reseedDrainFor(nf);
    setMode('select'); setDrawingFace(false); setDraft([]);
    setRoofFormChosen(true); setShowIntro(false); clearHi();
  };
  // 片流れ（1面）の「水下＝軒」側を選ぶ（辺index）。水上は反対辺＝雨押え/片棟/つかみ込みの対象（積算反映は次段階）。雨樋も水下に組み直す。
  const chooseShedEave = (edgeIndex: number) => {
    if (faces.length !== 1) return;
    const nf: FaceInput[] = [{ ...faces[0], eaveEdgeIndex: edgeIndex }];
    setFaces(nf);
    reseedDrainFor(nf);
  };
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
  // 見積 Excel 出力：会社の「見積書書式」に完全一致（ExcelJS・罫線/結合/数値書式）。雨樋=WITH DOM価格、屋根=Roof Program価格。
  //   estimate（buildEstimate の出力＝Projection）を受け取り、書式化して書き出す共通処理。原則20：見積は Geometry の射影。
  const writeQuotationXlsx = async (estimate: unknown, filenameHint?: string) => {
    const ExcelJS = await loadExcelJS();
    const today = new Date().toISOString().slice(0, 10);
    const customer = (window.prompt('宛名（お客様名）を入力（空欄可）', '') ?? '').trim();
    const site = (window.prompt('現場住所を入力（空欄可）', '') ?? '').trim();
    const wb = buildQuotationWorkbook(ExcelJS, estimate as Parameters<typeof buildQuotationWorkbook>[1], {
      customer, site, title: '屋根・雨樋工事', work: '屋根・雨樋工事', validUntil: '発行後30日', date: today,
    });
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a'); a.href = url; a.download = `甍AI-見積-${filenameHint ? filenameHint + '-' : ''}${today}.xlsx`; a.click();
    URL.revokeObjectURL(url);
    setExcelDone(true);
    setLoadError(null);
  };
  // 現在キャンバスの状態から見積書を作成（新規版の下書き用）。
  const exportExcel = async () => {
    try {
      const doc = buildEstimate(rq, dq, withdomGutter as unknown as GutterProgram, withdomRoof as unknown as GutterProgram, 0);
      await writeQuotationXlsx(doc);
    } catch (err) {
      setLoadError('Excel出力に失敗（オフライン時は不可）: ' + (err instanceof Error ? err.message : String(err)));
    }
  };
  // 採用版（既定）から見積書を作成：Project の Decision が指す版の見積スナップショット（＝その形状の射影・原則20）を出力する。
  const exportAdoptedExcel = async () => {
    if (!decision) return;
    const rev = revisions.find((r) => r.id === decision.adoptedEstimationId);
    if (!rev || rev.quotationSnapshot == null) { setLoadError('採用版の見積データが見つかりません（版が削除された可能性があります）'); return; }
    try {
      await writeQuotationXlsx(rev.quotationSnapshot, `採用-E${String(rev.sequence).padStart(3, '0')}`);
    } catch (err) {
      setLoadError('Excel出力に失敗（オフライン時は不可）: ' + (err instanceof Error ? err.message : String(err)));
    }
  };
  // 積算保存（記録）：Model＋数量＋見積のスナップショットを保存。埋め込み時は Model を案件へ、記録はファイルにも残す。
  const saveEstimation = () => {
    const stamp = new Date().toISOString();
    const modelJson = serializeDocument(faces, dm, stamp);
    const snapshot = {
      savedAt: stamp,
      model: JSON.parse(modelJson),
      roofQuantities: rq, drainQuantities: dq,
      estimate: buildEstimate(rq, dq, withdomGutter as unknown as GutterProgram, withdomRoof as unknown as GutterProgram, 0),
    };
    const host = estimationHost();
    if (host?.projectId && typeof host.saveModel === 'function') host.saveModel(modelJson).catch(() => {});
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `甍AI-積算-${stamp.slice(0, 10)}.iraka-estimation.json`; a.click();
    URL.revokeObjectURL(url);
    setSavedAt(stamp); setLoadError(null);
    // 案件埋め込み時は、この保存を「履歴（Estimation-00N）」にも追記する（原則12：追記／原則20：形状を固定）。
    //   ★Geometry Revision には savedAt を含めない形状純粋版を渡す（同一形状なら複製せず再利用させるため）。
    if (host?.saveRevision) {
      host.saveRevision({
        model: serializeDocument(faces, dm),
        quantitySnapshot: { roof: rq, drain: dq },
        quotationSnapshot: snapshot.estimate,
        note: '', createdBy: '',
      }).then((res) => {
        flash(`✓ 履歴に保存しました（Estimation-${String(res.estimation.sequence).padStart(3, '0')}）`);
        refreshHistory();
      }).catch(() => {});
    }
  };
  const flash = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(null), 1300); };
  // 案件の Estimation 履歴を再読込
  const refreshHistory = () => {
    const host = estimationHost();
    if (host?.listRevisions) host.listRevisions().then((rows) => setRevisions(rows || [])).catch(() => {});
    refreshDecision();
  };
  // 採用版の判断（Decision）を Project から再読込（原則19：判断は Project=SSOT に置く）
  const refreshDecision = () => {
    const host = estimationHost();
    if (host?.getDecision) host.getDecision().then((d) => setDecisionState(d || null)).catch(() => {});
  };
  // 「採用」開始：誰が・なぜ を入力するインライン欄を開く（いつ＝確定時に自動）
  const beginAdopt = (rev: EstimationRevisionRec) => setAdoptDraft({ id: rev.id, by: decision?.decidedBy || '', reason: '' });
  const cancelAdopt = () => setAdoptDraft(null);
  // 採用を確定：Project 側 Decision に { adoptedEstimationId, decidedBy, decidedAt, reason } を保存する。
  const confirmAdopt = () => {
    if (!adoptDraft) return;
    const host = estimationHost();
    const d: EstimationDecision = {
      adoptedEstimationId: adoptDraft.id,
      decidedBy: adoptDraft.by.trim() || undefined,
      decidedAt: new Date().toISOString(),
      reason: adoptDraft.reason.trim() || undefined,
    };
    if (host?.setDecision) {
      host.setDecision(d).then((saved) => { setDecisionState(saved || d); setAdoptDraft(null); flash('✓ 採用版を設定しました'); })
        .catch(() => setLoadError('採用版の保存に失敗しました'));
    } else { setDecisionState(d); setAdoptDraft(null); }
  };
  // 過去版を開く：当時の Geometry Revision を読み込む（数量・見積は Geometry から自動再計算＝Projection・原則20）
  const openRevision = (rev: EstimationRevisionRec) => {
    const host = estimationHost();
    if (!host?.openRevision) return;
    host.openRevision(rev.geometryRevisionId).then((json) => {
      if (json && loadFromJson(json)) {
        setRoofDone(true); // 過去版は確定済み形状として開く
        flash(`Estimation-${String(rev.sequence).padStart(3, '0')} を開きました`);
        setShowHistory(false);
      }
    }).catch(() => setLoadError('過去版の読み込みに失敗しました'));
  };
  // 埋め込み時：起動時に案件から復元（host があれば）＋履歴の初期読込
  useEffect(() => {
    const host = estimationHost();
    if (host?.projectId && typeof host.loadModel === 'function') {
      host.loadModel().then((json) => { if (json) loadFromJson(json); }).catch(() => {});
    }
    if (host?.listRevisions) host.listRevisions().then((rows) => setRevisions(rows || [])).catch(() => {});
    if (host?.getDecision) host.getDecision().then((d) => setDecisionState(d || null)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const savedLabel = savedAt ? `💾 最終保存 ${new Date(savedAt).toLocaleString('ja-JP', { hour: '2-digit', minute: '2-digit', month: 'numeric', day: 'numeric' })}` : '未保存';

  // 縮尺合わせ中のカーソル追従ヒント（①点目/②点目をクリック）用にポインタ位置を追う。
  const onStageMove = (e: any) => {
    if (mode !== 'calibrate') { if (cursorPt) setCursorPt(null); return; }
    const p = e.target.getStage().getPointerPosition();
    setCursorPt(p ? { x: p.x, y: p.y } : null);
  };
  const onStageClick = (e: any) => {
    if (bgAdjust) return; // 図面の位置調整中は屋根の作図を止める
    const p = e.target.getStage().getPointerPosition(); if (!p) return;
    const pt = { x: Math.round(p.x), y: Math.round(p.y) };
    if (mode === 'calibrate') { // 較正：図面上で既知長さの2点をクリック
      const npts = [...calPts, pt];
      if (npts.length >= 2) applyCalibration(npts[0], npts[1]); else setCalPts(npts);
      return;
    }
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
        {onBackToDrawings && <button onClick={onBackToDrawings} title="図面ドロップに戻る">← 図面</button>}
        <strong>甍AI 積算スタジオ</strong>
        <span className="rs-type">屋根: <b>{roofType(model) ? TYPE_LABEL[roofType(model)!] : '—'}</b></span>
        <span className="rs-sp" />
        {/* 通常モードは最小限（保存・開く・詳細）。作図/縮尺/見積は下のAIナビから起動する＝ボタン重複をなくす。 */}
        <span className="rs-doc">
          <button onClick={onSave}>💾 保存</button>
          <button onClick={() => fileRef.current?.click()}>📂 開く</button>
          <button className={advanced ? 'on' : ''} onClick={() => setAdvanced((v) => !v)} title="ツール一覧（検証・計測・手動出力など）">{advanced ? '詳細 ▲' : '詳細 ▾'}</button>
          <span className="rs-saved">{savedLabel}</span>
          <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={onFile} />
        </span>
      </header>
      {/* 詳細モード：普段は隠すツール（モード切替・検証・計測・手動の見積/積算出力）。AIナビと機能が重複するものはここへ集約。 */}
      {advanced && (
        <div className="rs-sub" style={{ background: '#f1f3f5' }}>
          <span className="rs-lbl">ツール：</span>
          {(['select', 'gutter', 'calibrate', 'measure'] as Mode[]).map((m) => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => { setMode(m); setActiveRun(null); setSelDrop(null); setRouteHead(null); setCalPts([]); clearHi(); }}>
              {m === 'select' ? '屋根を描く' : m === 'gutter' ? '雨樋を描く' : m === 'calibrate' ? '縮尺合わせ' : '計測'}
            </button>
          ))}
          <span className="rs-sp2" />
          <button className={showAcceptance ? 'on' : ''} onClick={() => setShowAcceptance((v) => !v)} title="積算 検証パネル">検証</button>
          <button onClick={exportExcel} title="会社の見積書書式でExcel出力">📊 見積書を作成</button>
          <button onClick={saveEstimation} title="積算（Model＋数量＋見積）を保存。案件では履歴にも追記">🗂 積算保存</button>
          {hasHistory && <button className={showHistory ? 'on' : ''} onClick={() => { setShowHistory((v) => !v); refreshHistory(); }} title="この案件の積算履歴（Estimation-001/002…）">🕘 履歴{revisions.length ? `（${revisions.length}）` : ''}</button>}
        </div>
      )}
      {/* 積算履歴パネル（案件埋め込み時のみ）：過去版の一覧＋開く。原則19/20＝Projectが器・Geometryを固定して再現。 */}
      {showHistory && hasHistory && (
        <div style={{ background: '#fff', borderBottom: '1px solid #d0e2f5', padding: '12px 16px', maxHeight: 260, overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <b style={{ fontSize: 14, color: '#1a2530' }}>積算履歴</b>
            <span style={{ fontSize: 12, color: '#868e96' }}>「積算保存」するたびに Estimation-001, 002… と追記されます（保存済みは上書きしません）。</span>
            <span style={{ flex: 1 }} />
            <button onClick={saveEstimation} style={{ fontSize: 13, fontWeight: 700, padding: '7px 14px', borderRadius: 8, border: 'none', color: '#fff', background: '#1971c2', cursor: 'pointer' }}>＋ この状態を履歴に保存</button>
          </div>
          {/* 採用版バナー（原則19：判断は Project 側の Decision＝誰が・いつ・なぜ）。採用版が見積出力の既定になる。 */}
          {(() => {
            const adopted = decision ? revisions.find((r) => r.id === decision.adoptedEstimationId) : undefined;
            if (!decision) {
              return <div style={{ fontSize: 12, color: '#868e96', padding: '2px 0 10px' }}>まだ採用版は決まっていません。見積に使う版を「採用」で1つ選ぶと、ここに（誰が・いつ・なぜ）を残し、見積出力の既定になります。</div>;
            }
            return (
              <div style={{ background: '#ebfbee', border: '1px solid #b2f2bb', borderRadius: 8, padding: '9px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#2b8a3e' }}>✓ 採用版：{adopted ? `Estimation-${String(adopted.sequence).padStart(3, '0')}` : '（この版は削除済み）'}</span>
                <span style={{ fontSize: 12, color: '#495057' }}>
                  {decision.decidedBy ? `決定：${decision.decidedBy}` : '決定者：未記入'}
                  ・{new Date(decision.decidedAt).toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {decision.reason ? `・理由：${decision.reason}` : ''}
                </span>
                <span style={{ flex: 1 }} />
                {adopted && <button onClick={exportAdoptedExcel} title="採用版の見積スナップショット（その形状の射影）で見積書を作成" style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 7, border: 'none', color: '#fff', background: '#2b8a3e', cursor: 'pointer' }}>📊 採用版で見積書を作成</button>}
              </div>
            );
          })()}
          {revisions.length === 0 ? (
            <div style={{ fontSize: 13, color: '#868e96', padding: '8px 0' }}>まだ履歴はありません。「積算保存」で最初の版（Estimation-001）ができます。</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ color: '#868e96', textAlign: 'left' }}>
                <th style={{ padding: '4px 8px' }}>版</th><th style={{ padding: '4px 8px' }}>日時</th>
                <th style={{ padding: '4px 8px' }}>形状</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>合計</th>
                <th style={{ padding: '4px 8px' }}>メモ</th><th style={{ padding: '4px 8px' }}>採用</th><th></th>
              </tr></thead>
              <tbody>
                {revisions.slice().reverse().map((r) => {
                  const total = (r.quotationSnapshot && typeof r.quotationSnapshot === 'object') ? (r.quotationSnapshot as { total?: number }).total : undefined;
                  const isAdopted = decision?.adoptedEstimationId === r.id;
                  const editing = adoptDraft?.id === r.id;
                  return (
                    <Fragment key={r.id}>
                    <tr style={{ borderTop: '1px solid #f1f3f5', background: isAdopted ? '#ebfbee' : undefined }}>
                      <td style={{ padding: '6px 8px', fontWeight: 700 }}>Estimation-{String(r.sequence).padStart(3, '0')}</td>
                      <td style={{ padding: '6px 8px', color: '#495057' }}>{new Date(r.createdAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                      <td style={{ padding: '6px 8px', color: '#868e96' }}>Geometry-{String(r.geometrySequence ?? 0).padStart(3, '0')}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{total != null ? `¥${Math.round(total).toLocaleString('ja-JP')}` : '—'}</td>
                      <td style={{ padding: '6px 8px', color: '#495057' }}>{r.note || ''}</td>
                      <td style={{ padding: '6px 8px' }}>
                        {isAdopted
                          ? <span style={{ fontSize: 11, fontWeight: 800, color: '#2b8a3e', background: '#d3f9d8', borderRadius: 6, padding: '3px 8px' }}>✓ 採用中</span>
                          : <button onClick={() => beginAdopt(r)} style={{ fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 7, border: '1px solid #b2f2bb', color: '#2b8a3e', background: '#fff', cursor: 'pointer' }}>採用</button>}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}><button onClick={() => openRevision(r)} style={{ fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 7, border: '1px solid #74b0e6', color: '#1971c2', background: '#fff', cursor: 'pointer' }}>開く</button></td>
                    </tr>
                    {editing && (
                      <tr style={{ background: '#f8fff9' }}>
                        <td colSpan={7} style={{ padding: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#2b8a3e' }}>Estimation-{String(r.sequence).padStart(3, '0')} を採用：</span>
                            <input value={adoptDraft!.by} onChange={(e) => setAdoptDraft({ ...adoptDraft!, by: e.target.value })} placeholder="誰が（決定者）" style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid #ced4da', width: 140 }} />
                            <input value={adoptDraft!.reason} onChange={(e) => setAdoptDraft({ ...adoptDraft!, reason: e.target.value })} placeholder="なぜ（採用理由）" style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid #ced4da', flex: 1, minWidth: 180 }} />
                            <button onClick={confirmAdopt} style={{ fontSize: 12, fontWeight: 700, padding: '5px 14px', borderRadius: 7, border: 'none', color: '#fff', background: '#2b8a3e', cursor: 'pointer' }}>採用を確定</button>
                            <button onClick={cancelAdopt} style={{ fontSize: 12, padding: '5px 10px', borderRadius: 7, border: '1px solid #ced4da', color: '#495057', background: '#fff', cursor: 'pointer' }}>取消</button>
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
      {/* ── AIナビ（初回ガイド）：現在地を常時表示し、次の一手だけを案内。専門用語は使わない。 ── */}
      {(() => {
        const steps = ['図面を開く', '縮尺を合わせる', '屋根をなぞる', 'AIが数量を計算', '見積書を作成'];
        const circ = ['①', '②', '③', '④', '⑤'];
        const done = [true, !!calibration, roofDone, roofDone && dq.length > 0, excelDone];
        const cur = done.findIndex((d) => !d); // -1 = 全ステップ完了
        const chip = (i: number) => {
          const isDone = done[i]; const isCur = i === cur;
          const bg = isCur ? '#1971c2' : isDone ? '#e6f4ea' : '#f1f3f5';
          const fg = isCur ? '#fff' : isDone ? '#2b8a3e' : '#868e96';
          return (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 999, background: bg, color: fg, fontWeight: isCur ? 800 : 600, fontSize: 13, boxShadow: isCur ? '0 2px 8px rgba(25,113,194,.35)' : 'none' }}>
              <span style={{ fontWeight: 800 }}>{isDone && !isCur ? '✓' : circ[i]}</span>{steps[i]}
            </span>
          );
        };
        // 現在ステップの案内文＋主ボタン
        const scalePicker = cur === 1; // ②は「寸法を選ぶ→両端クリック」の専用UI
        const formPicker = cur === 2;  // ③は「屋根の形をえらぶ」専用UI（形から始める＝描画を楽に）
        const inCalibrating = mode === 'calibrate';
        const isShed = faces.length === 1; // 片流れ（1面）＝水下/水上の指定対象
        let title = ''; let body = ''; const actions: { label: string; primary?: boolean; onClick: () => void }[] = [];
        if (cur === 1) {
          title = '次は縮尺を合わせます';
          body = inCalibrating
            ? `図面上で、選んだ寸法の両端を2点クリックしてください（${calPts.length}/2）。`
            : '';
        } else if (cur === 2) {
          title = '次は「屋根の形をえらぶ」';
          body = '';
        } else if (cur === 3) {
          title = 'AIが数量を計算します';
          body = '雨樋がまだ入っていません。「雨樋を描く」を押すと、AIが軒樋・集水器・縦樋を自動で提案します。';
          actions.push({ label: '🌧 雨樋を描く', primary: true, onClick: () => { setMode('gutter'); } });
        } else if (cur === 4) {
          title = '最後に「見積書を作成」';
          body = '右の数量を確認したら、ボタンひとつで会社の見積書（Excel）ができます。';
          actions.push({ label: '📊 見積書を作成', primary: true, onClick: () => { void exportExcel(); } });
        } else {
          title = '✓ すべて完了しました';
          body = '見積書ができました。数量や屋根を直したいときは、上のステップからやり直せます。';
        }
        const scaleChip = (label: string, meters: number | null) => (
          <button key={label} onClick={() => meters == null ? (setMode('calibrate'), setShowIntro(false)) : pickScale(meters)}
            className={inCalibrating && meters != null && Number(knownLen) === meters ? 'on' : ''}
            style={{ fontSize: 14, fontWeight: 700, padding: '9px 16px', borderRadius: 8, cursor: 'pointer',
              border: (inCalibrating && meters != null && Number(knownLen) === meters) ? 'none' : '1px solid #74b0e6',
              color: (inCalibrating && meters != null && Number(knownLen) === meters) ? '#fff' : '#1971c2',
              background: (inCalibrating && meters != null && Number(knownLen) === meters) ? '#1971c2' : '#fff' }}>
            {label}
          </button>
        );
        return (
          <div style={{ background: '#f8fbff', borderBottom: '1px solid #d0e2f5', padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {steps.map((_, i) => <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>{chip(i)}{i < 4 && <span style={{ color: '#adb5bd', margin: '0 2px' }}>›</span>}</span>)}
              <span style={{ flex: 1 }} />
              <button onClick={() => setGuideOn((v) => !v)} style={{ fontSize: 12, color: '#6b7885', background: 'none', border: 'none', cursor: 'pointer' }}>{guideOn ? '案内を隠す' : '案内を表示'}</button>
            </div>
            {guideOn && (
              <div style={{ marginTop: 8, padding: '10px 14px', background: '#fff', border: '1px solid #d0e2f5', borderRadius: 10 }}>
                <div style={{ fontWeight: 800, color: '#1a2530', fontSize: 14 }}>{title}</div>
                {scalePicker ? (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ color: '#495057', fontSize: 13, marginBottom: 6 }}><b>①</b> 使う寸法を選ぶ（図面で長さが分かる所）</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                      {scaleChip('1マス（910mm）', 0.91)}
                      {scaleChip('柱2本の間（1820mm）', 1.82)}
                      {scaleChip('2間（3640mm）', 3.64)}
                      {scaleChip('その他の長さ', null)}
                    </div>
                    <div style={{ color: '#495057', fontSize: 13 }}><b>②</b> 図面上で、その寸法の<b>両端を2点クリック</b>{inCalibrating ? `（いま ${calPts.length}/2）` : '（上の寸法を選ぶと始まります）'}</div>
                    {inCalibrating && calPts.length > 0 && <button onClick={() => setCalPts([])} style={{ marginTop: 6, fontSize: 12 }}>やり直す</button>}
                  </div>
                ) : formPicker ? (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ color: '#495057', fontSize: 13, marginBottom: 6 }}>
                      <b>①</b> 屋根の形をえらぶ（<b>平面図＝真上から見た形</b>をなぞります。立面図は<b>勾配（何寸）</b>を読むときだけ）
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      {([['shed', '片流れ'], ['gable', '切妻'], ['hipped', '寄棟／方形']] as const).map(([k, label]) => (
                        <button key={k} onClick={() => chooseForm(k)}
                          style={{ fontSize: 14, fontWeight: 700, padding: '9px 16px', borderRadius: 8, cursor: 'pointer', border: '1px solid #74b0e6', color: '#1971c2', background: '#fff' }}>
                          {label}
                        </button>
                      ))}
                      <button onClick={() => { setMode('select'); setDrawingFace(true); setDraft([]); setRoofFormChosen(false); setShowIntro(false); }}
                        style={{ fontSize: 13, fontWeight: 700, padding: '9px 14px', borderRadius: 8, cursor: 'pointer', border: '1px dashed #adb5bd', color: '#495057', background: '#fff' }}>
                        自分で描く（変形屋根）
                      </button>
                    </div>
                    {roofFormChosen && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ color: '#495057', fontSize: 13, marginBottom: 6 }}>
                          <b>②</b> 屋根の<b>角をドラッグ</b>して、平面図の外周に合わせてください（棟・隅棟・軒・ケラバは形から自動で決まります）。
                        </div>
                        {isShed && (
                          <div style={{ background: '#fff9db', border: '1px solid #ffe08a', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
                            <div style={{ fontSize: 13, color: '#7a5a00', marginBottom: 6 }}>
                              片流れ：<b>水下（＝軒）はどの辺？</b>（反対の水上は 雨押え／片棟／つかみ込み の対象）
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {([['上', 0], ['右', 1], ['下', 2], ['左', 3]] as const).map(([label, idx]) => (
                                <button key={idx} onClick={() => chooseShedEave(idx)}
                                  className={faces[0]?.eaveEdgeIndex === idx ? 'on' : ''}
                                  style={{ fontSize: 13, fontWeight: 700, padding: '6px 14px', borderRadius: 7, cursor: 'pointer',
                                    border: faces[0]?.eaveEdgeIndex === idx ? 'none' : '1px solid #f0b429',
                                    color: faces[0]?.eaveEdgeIndex === idx ? '#fff' : '#a86a00',
                                    background: faces[0]?.eaveEdgeIndex === idx ? '#f08c00' : '#fff' }}>
                                  {label}
                                </button>
                              ))}
                            </div>
                            <div style={{ fontSize: 12, color: '#2b8a3e', fontWeight: 700, marginTop: 6 }}>
                              ✓ 水下（軒）＝{({ 0: '上', 1: '右', 2: '下', 3: '左' } as Record<number, string>)[faces[0]?.eaveEdgeIndex ?? 0]} に設定。軒樋もこの辺に付きます。
                            </div>
                            <div style={{ fontSize: 11, color: '#a86a00', marginTop: 2 }}>※水上の納まり（雨押え/片棟/つかみ込み）の積算反映は次の段階で入れます。</div>
                          </div>
                        )}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 8, borderTop: '1px dashed #d0e2f5' }}>
                      <button onClick={() => { setRoofDone(true); setMode('gutter'); }}
                        style={{ fontSize: 15, fontWeight: 800, padding: '11px 22px', borderRadius: 8, border: 'none', cursor: 'pointer', color: '#fff', background: '#2b8a3e', boxShadow: '0 2px 8px rgba(43,138,62,.35)' }}>
                        {roofFormChosen ? 'この屋根で確定 → 次へ進む' : '屋根はこれで確定 → 次へ進む'}
                      </button>
                      <span style={{ fontSize: 12, color: '#6b7885' }}>形を選び、角を図面に合わせたら、このボタンで数量・見積へ進みます。</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ flex: 1, color: '#495057', fontSize: 13, marginTop: 2, lineHeight: 1.6 }}>{body}</div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      {actions.map((a, i) => (
                        <button key={i} onClick={a.onClick}
                          style={{ fontSize: 14, fontWeight: 700, padding: '10px 18px', borderRadius: 8, border: a.primary ? 'none' : '1px solid #ced4da', cursor: 'pointer', color: a.primary ? '#fff' : '#495057', background: a.primary ? '#1971c2' : '#fff', boxShadow: a.primary ? '0 2px 8px rgba(25,113,194,.3)' : 'none' }}>
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}
      {loadError && <div className="rs-loaderr">⚠ {loadError}<button onClick={() => setLoadError(null)}>×</button></div>}
      {showAcceptance && <AcceptancePanel quantities={dq} hasDrawing={!!(planImg || elevImg)} calibrated={!!calibration}
        roofModel={model} scale={scale} onAdoptDrain={(d) => { setDrain(initHistory(d)); idc.current = maxIdSuffix(d) + 1; }}
        onClose={() => setShowAcceptance(false)} />}

      {/* 図面背景バー：図面が入っているときだけ。人が下地の図面を見ながら屋根・雨樋をトレースする。 */}
      {(planImg || elevImg) && (
        <div className="rs-sub" style={{ background: '#eef4fb' }}>
          <span className="rs-lbl">図面:</span>
          <button className={bgWhich === 'plan' ? 'on' : ''} disabled={!planImg} onClick={() => switchBg('plan')}>平面図</button>
          <button className={bgWhich === 'elevation' ? 'on' : ''} disabled={!elevImg} onClick={() => switchBg('elevation')}>立面図</button>
          <button className={bgOn ? 'on' : ''} onClick={() => setBgOn((v) => !v)}>{bgOn ? '表示中' : '非表示'}</button>
          <span className="rs-lbl">濃さ</span>
          <input type="range" min={0.1} max={1} step={0.05} value={bgOpacity} onChange={(e) => setBgOpacity(Number(e.target.value))} style={{ width: 80 }} />
          <span className="rs-lbl">大きさ</span>
          <input type="range" min={0.2} max={3} step={0.02} value={bgScale} onChange={(e) => setBgScale(Number(e.target.value))} style={{ width: 90 }} />
          <button className={bgAdjust ? 'on' : ''} onClick={() => setBgAdjust((v) => !v)} title="図面をドラッグで移動できます（その間、屋根の作図は止まります）">
            {bgAdjust ? '調整中：終了' : '位置調整'}
          </button>
          {bgImg && <button onClick={() => fitImage(bgImg)}>枠に合わせる</button>}
          {bgAdjust && <span className="rs-lbl" style={{ color: '#1971c2' }}>図面をドラッグで移動。終わったら「終了」。</span>}
        </div>
      )}

      {/* 縮尺合わせバー：分かっている長さ(m)を入れ、図面上でその長さの2点をクリック→縮尺を確定。全数量の基準。 */}
      {mode === 'calibrate' && (
        <div className="rs-sub" style={{ background: '#fff4e6' }}>
          <span className="rs-lbl">縮尺合わせ：</span>
          <span className="rs-lbl">分かっている長さ(m)</span>
          <input type="number" step="0.001" min="0" value={knownLen} onChange={(e) => setKnownLen(e.target.value)} style={{ width: 74 }} />
          <span className="rs-lbl">→ 図面上で、その長さの両端を2点クリック（{calPts.length}/2）</span>
          {calPts.length > 0 && <button onClick={() => setCalPts([])}>やり直し</button>}
          <span className="rs-sp" />
          <span className="rs-lbl" style={{ color: calibration ? '#2f9e44' : '#e8590c' }}>
            {calibration ? `✓ 縮尺OK（${calibration.sourceLength}m を基準に設定済み）` : '未設定（このままだと数量は仮の値です）'}
          </span>
        </div>
      )}

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
        {mode === 'measure' && <span className="rs-lbl">計測は次の段階です。いまは「屋根を描く／雨樋を描く」をお使いください。</span>}
      </div>

      <div className="rs-body">
        {/* 左: Face / Edge / 軒樋 / 経路 一覧 */}
        <aside className="rs-left">
          <h4>屋根面（{model.faces.length}）</h4>
          {model.faces.map((f, i) => (
            <div key={f.id} className={'rs-item' + (hi.has(f.id) ? ' hi' : '')} onMouseEnter={() => highlightElement(f.id)} onMouseLeave={clearHi}>
              <span>{f.id} · {(faceArea(model, f) / (scale * scale)).toFixed(2)}㎡</span>
              <span className="rs-row-r"><input type="number" step={0.5} min={0} value={f.slope.pitch ?? 0} onChange={(e) => setPitch(i, Number(e.target.value))} />寸
                <button className="rs-del" onClick={() => delFace(i)}>✕</button></span>
            </div>
          ))}
          <h4>辺（{model.edges.length}）</h4>
          {model.edges.map((e) => {
            const role = edgeRole(model, e);
            return (
              <div key={e.id} className={'rs-item' + (hi.has(e.id) ? ' hi' : '')} onMouseEnter={() => highlightElement(e.id)} onMouseLeave={clearHi}
                onClick={() => { if (mode === 'gutter' && role === 'eave') addOrSelectRun(e.id); }}>
                <span><b style={{ color: role ? ROLE_COLOR[role] : '#888' }}>{role ? ROLE_LABEL[role] : '—'}</b> {e.id}</span>
                <span className="rs-row-r">{(edgeLength(model, e) / scale).toFixed(2)}m</span>
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
            <h4>排水経路（点 {dm.graph.nodes.length} / 線 {dm.graph.edges.length}）</h4>
            {ddraw.segments.map((s) => (
              <div key={s.edgeId} className={'rs-item' + (hi.has(s.edgeId) ? ' hi' : '')} onMouseEnter={() => highlightElement(s.edgeId)} onMouseLeave={clearHi}>
                <span><b style={{ color: s.kind === 'downspout' ? DOWNSPOUT : CONNECTOR }}>{s.kind === 'downspout' ? '竪樋' : '呼び樋'}</b> {s.edgeId}</span>
                <span className="rs-row-r">{Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) / scale > 0 ? (Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) / scale).toFixed(2) : ''}m</span>
              </div>
            ))}
          </>}
        </aside>

        {/* 中央: キャンバス（Roof ＋ Drain オーバーレイ） */}
        <div className="rs-canvas" style={{ position: 'relative', cursor: mode === 'calibrate' ? 'crosshair' : undefined }}>
          {/* 仮の下書きバッジ：確定前は「AIの下書き・図面認識ではない」と明示（誤認防止） */}
          {!roofDone && (
            <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 5,
              background: '#fff4e6', border: '1px solid #ffc078', color: '#d9480f', borderRadius: 999,
              padding: '6px 16px', fontSize: 12.5, fontWeight: 700, boxShadow: '0 2px 8px rgba(0,0,0,.12)', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
              🔖 これは仮の下書きです（AIの提案。図面を認識した結果ではありません）
            </div>
          )}
          {/* 初回だけ中央に指示を重ねる。画面のどこかをクリックで閉じる（以後は上部AIナビが案内）。縮尺済みなら出さない。 */}
          {showIntro && !calibration && (
            <div onClick={() => setShowIntro(false)}
              style={{ position: 'absolute', inset: 0, zIndex: 6, background: 'rgba(26,37,48,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <div style={{ background: '#fff', borderRadius: 14, padding: '22px 26px', maxWidth: 440, boxShadow: '0 8px 30px rgba(0,0,0,.25)', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#1a2530' }}>まず「縮尺」を合わせます</div>
                <div style={{ fontSize: 13.5, color: '#495057', marginTop: 10, lineHeight: 1.8, textAlign: 'left' }}>
                  図面の数字を正しく出すために、最初に「実際の長さ」を1つだけ教えてください。<br />
                  <b>①</b> 上の案内で使う寸法（例：910mm）を選ぶ<br />
                  <b>②</b> 図面上で、その長さの<b>両端を2点クリック</b><br />
                  これで縮尺が決まり、面積や長さが実寸になります。
                </div>
                <div style={{ fontSize: 12, color: '#868e96', marginTop: 10 }}>※ いま表示中の屋根・雨樋は「仮の下書き」です。</div>
                <div style={{ marginTop: 16, fontSize: 14, fontWeight: 700, color: '#1971c2' }}>▶ 画面のどこかをクリックして始めましょう</div>
              </div>
            </div>
          )}
          {/* 成功トースト：縮尺確定などの「進めた」瞬間を一瞬見せる */}
          {toast && (
            <div style={{ position: 'absolute', top: '46%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 7,
              background: '#2b8a3e', color: '#fff', borderRadius: 12, padding: '14px 28px', fontSize: 17, fontWeight: 800,
              boxShadow: '0 6px 24px rgba(0,0,0,.28)', pointerEvents: 'none' }}>
              {toast}
            </div>
          )}
          <Stage width={W} height={H} onMouseDown={onStageClick} onMouseMove={onStageMove}>
            <Layer>
              {/* 図面下地（トレース対象）。position調整中だけ操作可、それ以外は不可視のクリック透過。 */}
              {bgOn && bgImg && <KonvaImage image={bgImg} x={bgPos.x} y={bgPos.y} scaleX={bgScale} scaleY={bgScale}
                opacity={bgOpacity} listening={bgAdjust} draggable={bgAdjust}
                onDragEnd={(e) => setBgPos({ x: e.target.x(), y: e.target.y() })} />}
              {/* 屋根＋雨樋は「確定」までは仮の下書き＝半透明で表示（図面認識の結果ではない）。roofDoneで実線化。 */}
              <Group opacity={roofDone ? 1 : 0.5}>
              {model.faces.map((f) => <Line key={f.id} points={flat(facePolygon(model, f))} closed
                fill={hi.has(f.id) ? 'rgba(232,89,12,0.22)' : 'rgba(31,78,121,0.06)'} stroke="#c7d0da" strokeWidth={1}
                dash={roofDone ? undefined : [8, 5]} />)}
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
              </Group>
              {/* 経路構築中：head から次点への予告線は出さず、head を強調 */}
              {routeHead && (() => { const hn = dm.graph.nodes.find((n) => n.id === routeHead); return hn
                ? <Circle key="head" x={hn.point.x} y={hn.point.y} radius={10} stroke={ELBOW} strokeWidth={2} dash={[3, 3]} /> : null; })()}
              {draft.length > 0 && <Line points={flat(draft)} stroke="#2e74b5" strokeWidth={2} dash={[6, 4]} />}
              {/* 較正マーカー：クリック中の点＋確定した較正線 */}
              {mode === 'calibrate' && calPts.map((cp, i) => <Circle key={'calp' + i} x={cp.x} y={cp.y} radius={5} fill="#f08c00" stroke="#fff" strokeWidth={1} />)}
              {mode === 'calibrate' && calPts.length === 1 && cursorPt && <Line points={[calPts[0].x, calPts[0].y, cursorPt.x, cursorPt.y]} stroke="#f08c00" strokeWidth={2} dash={[4, 4]} opacity={0.7} />}
              {/* カーソル追従ヒント：①点目/②点目をクリック（縮尺合わせ中だけ） */}
              {mode === 'calibrate' && cursorPt && (() => {
                const label = calPts.length === 0 ? '①点目をクリック' : '②点目をクリック';
                const w = label.length * 13 + 16;
                return (
                  <Group x={cursorPt.x + 14} y={cursorPt.y + 14} listening={false}>
                    <Rect width={w} height={26} cornerRadius={13} fill="#1971c2" opacity={0.95} />
                    <Text x={0} y={0} width={w} height={26} align="center" verticalAlign="middle" text={label} fontSize={13} fontStyle="bold" fill="#fff" />
                  </Group>
                );
              })()}
              {calibration && <Line points={[calibration.p1.x, calibration.p1.y, calibration.p2.x, calibration.p2.y]} stroke="#f08c00" strokeWidth={2} dash={[4, 4]} />}
              {model.edges.map((e) => { const role = edgeRole(model, e); if (!role) return null; const a = V.get(e.v[0]); const b2 = V.get(e.v[1]); if (!a || !b2) return null;
                return <Text key={'t' + e.id} x={(a.x + b2.x) / 2 - 8} y={(a.y + b2.y) / 2 - 8} text={ROLE_LABEL[role]} fontSize={11} fill={ROLE_COLOR[role]} />; })}
            </Layer>
          </Stage>
          <div className="rs-hint">
            {mode === 'gutter' ? (routeHead
              ? '経路構築中：空きをクリックで途中点を追加（次:エルボ/排水を切替）。「排水(終端)」で終了。'
              : '軒(緑)クリック→軒樋／軒樋を選び軒上クリック→集水器／集水器を選び「経路を描く」→クリックで竪樋・エルボ・呼び樋・排水。（Undo/Redo可）')
              : mode === 'select' ? 'プリセット／描画で屋根を編集。「雨樋を描く」で雨樋へ。' : '計測は次の段階です。'}
          </div>
        </div>

        {/* 右: 数量（Evidence付き）＋ Validator ＋ 伏図 */}
        <aside className="rs-right">
          <h4>屋根 数量</h4>
          <table className="rs-qty"><tbody>
            {rq.map((q) => <tr key={q.key} className={[...hi].some((id) => q.evidence.find((e) => e.id === id)) ? 'hi' : ''}
              onMouseEnter={() => highlightQuantity(q.evidence)} onMouseLeave={clearHi}>
              <td>{q.label}</td><td className="rs-val">{q.value.toFixed(2)}<small> {q.unit}</small></td>
              <td className="rs-basis">{(q.evidence[0]?.kind === 'face' ? '面' : '辺')}×{q.evidence.length}</td></tr>)}
          </tbody></table>

          <h4 className="rs-mt">雨樋 数量 <small>（根拠付き）</small></h4>
          <table className="rs-qty"><tbody>
            {dq.length === 0 && <tr><td colSpan={3} className="rs-empty">「雨樋を描く」で軒樋を配置</td></tr>}
            {dq.map((q) => <tr key={q.key} className={[...hi].some((id) => q.evidence.find((e) => e.id === id)) ? 'hi' : ''}
              onMouseEnter={() => highlightQuantity(q.evidence)} onMouseLeave={clearHi}>
              <td>{q.label}</td><td className="rs-val">{q.value.toFixed(2)}<small> {q.unit}</small></td>
              <td className="rs-basis">{q.evidence[0]?.kind === 'segment' ? '区間' : q.evidence[0]?.kind === 'node' ? '節点' : q.evidence[0]?.kind === 'drop' ? '縦樋' : '経路'}×{q.evidence.length}</td></tr>)}
          </tbody></table>

          <h4 className="rs-mt">部材 <small>（数量→施工意図→製品）</small></h4>
          <table className="rs-qty"><tbody>
            {mats.length === 0 && <tr><td colSpan={3} className="rs-empty">数量が出れば部材へ射影</td></tr>}
            {mats.map((m, i) => <tr key={m.kind + i} className={[...hi].some((id) => m.evidence.find((e) => e.id === id)) ? 'hi' : ''}
              onMouseEnter={() => highlightQuantity(m.evidence)} onMouseLeave={clearHi}>
              <td>{m.product ? m.product.name : m.kind + '（未解決）'}</td>
              <td className="rs-val">{Number.isInteger(m.qty) ? m.qty : m.qty.toFixed(2)}<small> {m.unit}</small></td>
              <td className="rs-basis">{m.product ? m.product.sku : 'IR:' + m.kind}</td></tr>)}
          </tbody></table>

          <h4 className="rs-mt">発注（部材表・付属）<small>（数量からの射影）</small></h4>
          <table className="rs-qty"><tbody>
            {bom.length === 0 && <tr><td colSpan={3} className="rs-empty">数量が出れば発注へ</td></tr>}
            {bom.map((l, i) => <tr key={(l.sku ?? l.kind) + i} className={[...hi].some((id) => l.evidence.find((e) => e.id === id)) ? 'hi' : ''}
              onMouseEnter={() => highlightQuantity(l.evidence)} onMouseLeave={clearHi}>
              <td>{l.name}</td>
              <td className="rs-val">{Number.isInteger(l.qty) ? l.qty : l.qty.toFixed(2)}<small> {l.unit}</small></td>
              <td className="rs-basis">{l.sku ?? '未解決'}</td></tr>)}
          </tbody></table>

          <h4 className="rs-mt">見積（例示単価）<small>（材料→労務→間接）</small></h4>
          <table className="rs-qty"><tbody>
            <tr><td>材料費</td><td className="rs-val">{yen(est.materialCost)}</td><td className="rs-basis">BOM×単価</td></tr>
            <tr><td>労務費</td><td className="rs-val">{yen(est.laborCost)}</td><td className="rs-basis">歩掛×人工</td></tr>
            <tr><td>間接費</td><td className="rs-val">{yen(est.indirectCost)}</td><td className="rs-basis">×0.15</td></tr>
            <tr><td><b>合計</b></td><td className="rs-val"><b>{yen(est.total)}</b></td><td className="rs-basis">Estimate</td></tr>
          </tbody></table>

          <h4 className="rs-mt">工程（例示）<small>（作業順・日数）</small></h4>
          <table className="rs-qty"><tbody>
            <tr><td>総工期</td><td className="rs-val">{sched.totalDuration.toFixed(2)}<small> 人日</small></td><td className="rs-basis">CPM</td></tr>
            <tr><td>クリティカル</td><td className="rs-val">{sched.criticalPath.length}<small> / {sched.tasks.length} 工程</small></td><td className="rs-basis">float0</td></tr>
          </tbody></table>

          <h4 className="rs-mt">品質・CO₂ <small>（例示）</small></h4>
          <table className="rs-qty"><tbody>
            <tr><td>品質（QA）</td><td className="rs-val">{insp.passCount}/{insp.checks.length}<small> pass</small></td><td className="rs-basis">{insp.allPass ? 'OK' : 'NG'}</td></tr>
            <tr><td>CO₂ 合計</td><td className="rs-val">{carbon.total.toFixed(1)}<small> kg</small></td><td className="rs-basis">材料+輸送+施工</td></tr>
            <tr><td>体制（Resource）</td><td className="rs-val">{res.totalLabor.toFixed(2)}<small> 人工</small></td><td className="rs-basis">{res.trades.length}職種</td></tr>
          </tbody></table>

          <h4 className="rs-mt">検証 {errCount > 0 ? <span className="rs-err">● {errCount} 件エラー</span> : <span className="rs-ok">● OK</span>}</h4>
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
