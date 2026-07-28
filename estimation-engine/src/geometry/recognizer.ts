// 甍AI Recognizer（図面→Roof Configuration の翻訳器）＝Roof Configuration Compiler の入口。
//   ★スコープ：甍AI は屋根専門。ここで扱う Configuration は常に「Roof Configuration」
//     （屋根勾配・軒の出・雨押え・片棟・ケラバ・雨樋・屋根材のみ）。建物全体は 小泉建設AI＝別プロジェクト。
//   正の設計：claude/CONFIGURATION_ARCHITECTURE.md（親）／claude/RECOGNIZER-ARCHITECTURE.md（本章）。
// 原則21：Recognizer は Provider の一つ。契約＝roofConfig.ts（Geometry は作らない・知らない）。
//
//   ★Recognizer は三層（責務分離）：
//     Reader    … 描いてあるものだけ読む（線・壁・北矢印・寸法・立面のトークン）。★一切推論しない。
//     Analyzer  … 建築知識で「候補」を作る（壁で囲まれた領域→RoofUnit候補／トークン→勾配・軒）。
//     Reconciler… 候補同士を整合して確定する（器へ Observation を集約→Roof Configuration）。
//   雨漏りOS対応：Reader=Observation ／ Analyzer=Hypothesis を作る ／ Reconciler=Evidence を統合して結論。
//
//     平面PDF →[Plan Reader] PlanReading(外周/壁/北矢印/寸法) →[Plan Analyzer] analyzePlan → RoofUnit候補 ┐
//     立面PDF →[Elev Reader] トークン →[Elev Analyzer] readElevation → ElevationSpec(勾配/軒/納まり)      ├→[Reconciler] reconcileRoofConfig → RoofConfiguration
//                                                                                                          ┘
//   ★Reader は推論しないので、AIモデル/OCR/LiDAR/写真を差し替えても壊れない。Analyzer だけ建築知識を持つ。
//   ★屋根系統（Roof Unit）は Reader の Observation でも Reconciler の出力でもなく、Plan Analyzer が作る「候補」。
//     Reconciler はその器へ Observation を集約するだけ（雨漏りOS の Case←Evidence と同型）。
//   正の設計：claude/RECOGNIZER-ARCHITECTURE.md（Reader / Analyzer / Reconciler の三層）。
import type { Dir, RoofConfiguration, RoofUnit, EdgeConfig, RoofUnitRole } from './roofConfig';
import { buildRoofConfiguration } from './roofConfig';
export type { Dir, RoofUnitRole } from './roofConfig'; // 方位・系統は Roof Configuration 契約が正（後方互換 re-export）

export const DIR_JP: Record<string, Dir> = { 南: 'south', 東: 'east', 北: 'north', 西: 'west' };

// STEP2：立面ごとに読めた生の値（座標グルーピング）。STEP3 でこれを sub-Compiler が Roof Configuration へ束ねる。
//   labels＝その立面の近くに在った屋根用語（片棟/雨押え/けらば/軒先…）。★Reader は「在った」までで、
//   どの辺かの判断はしない（例：雨押えの辺と軒の出の辺は別。混ぜない＝Resolverの仕事）。
export interface ElevationSpec { dir: Dir; pitches: number[]; overhangs: number[]; labels: string[] }

export interface RecoToken { str: string; x: number; y: number }

const OVERHANG_LABEL = /軒先|軒の出|軒出|樋先|けらば|ケラバ|妻/;
// 立面の近くに在れば「読めた」として拾う屋根用語（Reader は在否のみ・役割割当は Resolver）。
const ROOF_TERMS: { re: RegExp; label: string }[] = [
  { re: /片棟/, label: '片棟' }, { re: /雨押え|雨押|水切/, label: '雨押え' },
  { re: /けらば|ケラバ/, label: 'けらば' }, { re: /太陽光|ソーラー|ＰＶ|PV/, label: '太陽光' },
  { re: /ガルバリウム|ガルバ|GL鋼板/, label: 'ガルバリウム' }, { re: /雪止/, label: '雪止め' },
];
function num(s: string): number | null {
  const t = s.trim();
  if (!/^\d+(?:\.\d+)?$/.test(t.replace(/,/g, ''))) return null;
  const v = Number(t.replace(/,/g, ''));
  return isFinite(v) ? v : null;
}
function dist(ax: number, ay: number, bx: number, by: number) { return Math.hypot(ax - bx, ay - by); }

// ── Elevation Analyzer（R-2a）：立面のトークン（Reader 出力）→ 立面ごとの勾配・軒の出・納まりラベル候補 ──
//   入力トークン列は Elevation Reader（pdfText グリフ結合）が出す「描いてあるもの」。ここで勾配三角の上りや
//   軒の出寸法を最近傍で束ねる＝建築知識による候補づくり。どの Face/Edge かは Reconciler が整合で確定する。
export function readElevation(
  tokens: RecoToken[],
  opts: { triNear?: number; ovNear?: number } = {},
): ElevationSpec[] {
  const triNear = opts.triNear ?? 55;
  const ovNear = opts.ovNear ?? 85;
  const labels = tokens
    .map((t) => { const m = t.str.match(/^([南東北西])側?立面図?$/); return m ? { dir: DIR_JP[m[1]], x: t.x, y: t.y } : null; })
    .filter((l): l is { dir: Dir; x: number; y: number } => l != null);
  if (labels.length === 0) return [];
  const nearestDir = (x: number, y: number): Dir => {
    let best: { dir: Dir; d: number } | null = null;
    for (const l of labels) { const d = dist(x, y, l.x, l.y); if (!best || d < best.d) best = { dir: l.dir, d }; }
    return best!.dir;
  };
  const nums = tokens.map((t) => ({ v: num(t.str), x: t.x, y: t.y })).filter((n): n is { v: number; x: number; y: number } => n.v != null);
  const byDir = new Map<Dir, { pitches: Set<number>; overhangs: Set<number>; labels: Set<string> }>();
  const get = (d: Dir) => { let e = byDir.get(d); if (!e) { e = { pitches: new Set(), overhangs: new Set(), labels: new Set() }; byDir.set(d, e); } return e; };

  // 勾配三角：'10' の近傍にある 0.5〜12 の数字（上り＝寸）
  for (const t of tokens.filter((t) => t.str === '10')) {
    let best: { v: number; d: number } | null = null;
    for (const n of nums) { if (n.v === 10 || n.v < 0.5 || n.v > 12) continue; const d = dist(n.x, n.y, t.x, t.y); if (d <= triNear && (!best || d < best.d)) best = { v: n.v, d }; }
    if (best) get(nearestDir(t.x, t.y)).pitches.add(best.v);
  }
  // 軒の出：ラベル近傍の 150〜900mm
  for (const lb of tokens.filter((t) => OVERHANG_LABEL.test(t.str))) {
    for (const n of nums) { if (n.v < 150 || n.v > 900) continue; if (dist(n.x, n.y, lb.x, lb.y) <= ovNear) get(nearestDir(lb.x, lb.y)).overhangs.add(n.v); }
  }
  // 屋根用語（片棟/雨押え/けらば/太陽光/屋根材…）が在れば、最寄りの立面に「読めた」として記録（在否のみ）。
  for (const t of tokens) {
    for (const term of ROOF_TERMS) { if (term.re.test(t.str)) { get(nearestDir(t.x, t.y)).labels.add(term.label); break; } }
  }
  return (['south', 'east', 'north', 'west'] as Dir[])
    .filter((d) => byDir.has(d))
    .map((d) => ({ dir: d, pitches: [...byDir.get(d)!.pitches].sort((a, b) => a - b), overhangs: [...byDir.get(d)!.overhangs].sort((a, b) => a - b), labels: [...byDir.get(d)!.labels] }));
}

// 立面の勾配・軒・納まり候補づくりの現代語彙エイリアス（＝Elevation Analyzer）。readElevation は歴史的な名前。
export const analyzeElevation = readElevation;

// ══ Plan Reader（R-2b・描いてあるものだけ）══ ★推論しない。線・壁・北矢印・寸法・壁取り合い“候補”まで。
//   壁で囲まれた領域（PlanRegion）は「そこに閉じた領域が在る」という幾何的事実であって、「主屋根/下屋」の判断ではない。
export interface PlanRegion {
  id: string;
  area: number;         // 面積（相対でよい）。大小の比較にだけ使う
  facing?: Dir[];       // 外周線から、その領域が外に面する方位（幾何的事実）
  wallSides?: Dir[];    // 他棟/上階の壁に取り合う辺の方位（壁取り合い“候補”＝幾何的事実）
}
export interface PlanReading {
  regions?: PlanRegion[]; // 壁で囲まれた領域（幾何）。RoofUnit の判断はまだしない
  northDeg?: number;      // 北矢印（描いてある向き）
  // outline/walls/columns/grid/dimensions … 生のマークを足しても Reader は推論しない
}

// ══ Plan Analyzer（R-2b・建築知識で候補を作る）══ PlanReading（描いてあるもの）→ RoofUnit候補。
//   ここで初めて「この壁で囲まれた領域は主屋根らしい/下屋らしい」という建築知識を使う（＝Hypothesis を作る）。
export interface RoofUnitCandidate {
  role: RoofUnitRole;      // 主屋根/下屋/玄関下屋（Analyzer の判断＝候補）
  facing?: Dir[];          // その系統が面する方位（立面 Observation を集める鍵）
  dir?: Dir;               // 主に面する1方位（facing 省略時の後方互換）
  name?: string;           // 人が読む名（「東下屋」など）
  wallAdjacent?: boolean;  // 壁取り合い（Plan Reader の wallSides から Analyzer が判断）。true=雨押え/false=つかみ込み
}
export interface PlanAnalysis {
  units: RoofUnitCandidate[];  // 建築知識で作った RoofUnit候補（器の候補）
  northDeg?: number;
  faceCount?: number;
}
// Plan Analyzer 本体（第一版）：最大領域＝主屋根、他＝下屋。壁取り合いは wallSides の有無から。
//   ★これは Analyzer（判断）であって Reader ではない。外周認識が入ったら PlanReading が本物で埋まる。
export function analyzePlan(reading: PlanReading): PlanAnalysis {
  const regions = (reading.regions ?? []).slice().sort((a, b) => b.area - a.area); // 大きい順＝主屋根が先頭
  const DIR_NAME: Record<Dir, string> = { south: '南', east: '東', north: '北', west: '西' };
  const units: RoofUnitCandidate[] = regions.map((r, i) => {
    const role: RoofUnitRole = i === 0 ? 'main' : 'lower';
    // 主屋根の水上は片棟＝つかみ込み（下屋が主屋根の壁に取り合っても、それは主屋根の水上ではない）。
    // 下屋は上階の壁に取り合う辺（wallSides）が在れば水上＝雨押え、無ければ独立＝つかみ込み。
    const wallAdjacent = role === 'main' ? false : (r.wallSides?.length ?? 0) > 0;
    const facing = r.facing?.length ? r.facing : undefined;
    const name = role === 'main' ? '主屋根' : (facing && facing.length === 1 ? `${DIR_NAME[facing[0]]}下屋` : '下屋');
    return { role, name, wallAdjacent, ...(facing ? { facing } : {}) };
  });
  return { units, ...(reading.northDeg != null ? { northDeg: reading.northDeg } : {}), faceCount: regions.length };
}

export interface RoofObservations {
  plan?: PlanAnalysis;              // Plan Analyzer の出力（RoofUnit候補＝器の候補）
  elevations?: ElevationSpec[];     // Elevation Analyzer の出力（立面ごとの勾配/軒/納まり）
  // 後方互換：候補や面数を直接渡す旧経路（plan にまとめる前の呼び出し）。
  hierarchy?: RoofUnitCandidate[];  // = plan.units（旧）
  faceCount?: number;               // = plan.faceCount（旧）
  northDeg?: number;                // = plan.northDeg（旧）
}

// 水上の納まり（WITHDOM＝片棟/軒 仕様）：壁取り合いがあれば雨押え、無ければつかみ込み（壁に当たらない片棟）。
//   壁取り合いの判断が無ければ、系統の性格で既定（主屋根＝壁なし→つかみ込み／下屋＝壁あり→雨押え）。
function topRole(u: RoofUnitCandidate): EdgeConfig['role'] {
  const wall = u.wallAdjacent ?? (u.role !== 'main');
  return wall ? 'flashing' : 'grip';
}

// ══ Reconciler（R-3）══ 候補（器）へ Elevation Observation を集約し、器ごとに勾配・軒・水上を確定する。
//   gathered＝この器に属する立面の読み。fallbackPitch＝器が方位を持たない/読めない時の代表勾配。
function resolveUnit(u: RoofUnitCandidate, id: string, gathered: ElevationSpec[], fallbackPitch?: number): RoofUnit {
  const facing = u.facing?.length ? u.facing : (u.dir != null ? [u.dir] : []);
  const pitches = gathered.flatMap((r) => r.pitches);
  const slope = (pitches.length ? Math.min(...pitches) : undefined) ?? fallbackPitch;
  const edges: EdgeConfig[] = [];
  for (const d of facing) {
    const r = gathered.find((g) => g.dir === d);
    const ov = r && r.overhangs.length ? Math.min(...r.overhangs) : undefined;
    edges.push({ role: 'eave', dir: d, ...(ov != null ? { overhang: ov } : {}) });
  }
  // 水上の納まり（つかみ込み/雨押え）は片流れ＝1方向の系統だけ。多方向（寄棟/切妻）の頂部は棟で、Shape 確定に委ねる。
  if (facing.length <= 1) edges.push({ role: topRole(u) });
  return { id, role: u.role, ...(u.name ? { name: u.name } : {}), ...(slope != null ? { slope } : {}), edges };
}

export function reconcileRoofConfig(obs: RoofObservations): RoofConfiguration {
  const readings = obs.elevations ?? [];
  const pitches = Array.from(new Set(readings.flatMap((r) => r.pitches))).sort((a, b) => a - b);
  // Plan Observation を正とし、旧経路（hierarchy/faceCount 直渡し）を後方互換で受ける。
  const planUnits = obs.plan?.units ?? obs.hierarchy;
  const faceCount = obs.plan?.faceCount ?? obs.faceCount;

  // ★本筋：Plan Observation が発見した器があれば、各器へ Elevation Observation を集めて確定する。
  if (planUnits && planUnits.length) {
    const mainPitch = pitches.length ? pitches[0] : undefined;
    const units = planUnits.map((u, i) => {
      const facing = u.facing?.length ? u.facing : (u.dir != null ? [u.dir] : []);
      const gathered = readings.filter((r) => facing.includes(r.dir)); // 器へ Observation を集約
      return resolveUnit(u, `R${i + 1}`, gathered, mainPitch);
    });
    return buildRoofConfiguration(units);
  }

  // フォールバック（器が観測できない＝Plan Reader 未／外周未認識）：面数＝geometry優先→異勾配数で器を仮生成。
  const eaveEdges: EdgeConfig[] = readings
    .filter((r) => r.overhangs.length)
    .map((r) => ({ role: 'eave', dir: r.dir, overhang: Math.min(...r.overhangs) }));
  const nRoofs = (faceCount && faceCount > 0) ? faceCount : (pitches.length || 1);
  const units: RoofUnit[] = Array.from({ length: nRoofs }, (_, i) => ({
    id: `R${i + 1}`,
    ...(pitches.length ? { slope: pitches[Math.min(i, pitches.length - 1)] } : {}),
    ...(eaveEdges.length ? { edges: eaveEdges.map((e) => ({ ...e })) } : {}),
  }));
  return buildRoofConfiguration(units);
}
