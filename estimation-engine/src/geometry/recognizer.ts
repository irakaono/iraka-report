// 甍AI Recognizer（図面→Roof Configuration の翻訳器）＝Roof Configuration Compiler の入口。
//   ★スコープ：甍AI は屋根専門。ここで扱う Configuration は常に「Roof Configuration」
//     （屋根勾配・軒の出・雨押え・片棟・ケラバ・雨樋・屋根材のみ）。建物全体は 小泉建設AI＝別プロジェクト。
//   正の設計：claude/CONFIGURATION_ARCHITECTURE.md（親）／claude/RECOGNIZER-ARCHITECTURE.md（本章）。
// 原則21：Recognizer は Provider の一つ。
//   責務：図面を読み、宣言的な RoofConfig（Configuration）を返す。Geometry は作らない・知らない。
//   ★不変条件：Recognizer は Geometry を知らない／Geometry は Recognizer を知らない。契約は Configuration のみ。
//   Recognizer は Reader（読めた事実＝Observation）と Reconciler（複数Observationの統合→Roof Configuration）に分ける：
//     PDF → [Reader] readElevation → Observation(立面ごと)  ┐
//     平面の面数・真北 → Observation                        ├→ [Reconciler] reconcileRoofConfig → RoofConfiguration
//   ★屋根面は最初から在るのではなく、立面+平面+真北を突き合わせた「整合(Reconcile)」の結果として確定する。
//     ＝「割当」ではなく「統合」。雨漏りOSの Observation/Evidence/Reconcile と同じ思想。
//   Reader は OCR/抽出が変わっても壊れない。Reconciler は屋根の建築知識で証拠を整合。契約＝roofConfig.ts。
//   正の設計：claude/RECOGNIZER-ARCHITECTURE.md（R-1 契約 / R-2 Reader / R-3 Reconciler）。
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

// ── Reader（R-2）：立面ラベル（南側立面図 等）へ、勾配三角の上り と 軒の出寸法 を最近傍で割り当てた生の値 ──
//   ここまでは「読む」だけ。どの Face/Edge かは Resolver（R-3）が建築知識で解決する。
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

// ── Reconciler（R-3）：Roof Unit（器）へ Observation を集約し、器ごとに確定する ──
//   ★Roof Unit は Reconciler の「出力」ではなく「整合を行う単位（器）」。
//     設計者が建物を考えた単位（主屋根・下屋・玄関下屋）が先に在り、そこへ各方位の Observation を集める。
//     ＝雨漏りOS の Case←Evidence と同じ（Evidence から Case を作らない。Case に Evidence を集める）。
//         Roof Unit └ Observations（East/West/North/South/Plan）→ Reconcile → 勾配/軒/水上/雨樋 を確定
//     将来（太陽光・雪止め・天窓…）も「Unit に Observation が増えるだけ」。設計は変わらない。
//   真北の優先：①平面の北矢印（最も信頼）②立面の名称（南/東立面）③不一致は確認カードで質問。
//   系統（器）が観測できないときだけ、面数（geometry優先→異勾配数）から器を仮生成するフォールバックに落ちる。
export interface RoofUnitObservation {
  role: RoofUnitRole;   // 主屋根/下屋/玄関下屋（平面の階層構造＝設計者の単位）
  facing?: Dir[];       // その系統が面する方位（複数可。寄棟は四方）。ここへ立面 Observation を集める鍵
  dir?: Dir;            // 主に面する1方位（facing 省略時の後方互換）
  name?: string;        // 人が読む名（「東下屋」など）
}
export interface RoofObservations {
  elevations?: ElevationSpec[];       // Reader（立面ごとの読み取り＝Observation）
  faceCount?: number;                 // Geometry（平面の面数＝Observation）
  northDeg?: number;                  // 真北（方位整合＝Observation・優先①北矢印）
  hierarchy?: RoofUnitObservation[];  // 屋根系統（建物の階層構造＝器の一覧。主屋根＋下屋…）
}

// 水上の納まり既定（WITHDOM＝片棟/軒 仕様）：主屋根＝つかみ込み（壁に当たらない片棟）／下屋・玄関下屋＝雨押え（壁有）。
function topRole(role: RoofUnitRole): EdgeConfig['role'] { return role === 'main' ? 'grip' : 'flashing'; }

// 器（1つの Roof Unit）へ集めた立面 Observation から、その系統の勾配・軒・水上を確定する。
//   gathered＝この器に属する立面の読み。fallbackPitch＝器が方位を持たない/読めない時の代表勾配。
function resolveUnit(u: RoofUnitObservation, id: string, gathered: ElevationSpec[], fallbackPitch?: number): RoofUnit {
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
  if (facing.length <= 1) edges.push({ role: topRole(u.role) });
  return { id, role: u.role, ...(u.name ? { name: u.name } : {}), ...(slope != null ? { slope } : {}), edges };
}

export function reconcileRoofConfig(obs: RoofObservations): RoofConfiguration {
  const readings = obs.elevations ?? [];
  const pitches = Array.from(new Set(readings.flatMap((r) => r.pitches))).sort((a, b) => a - b);

  // ★本筋：屋根系統（器）が在れば、各器へ Observation を集めて確定する。
  if (obs.hierarchy && obs.hierarchy.length) {
    const mainPitch = pitches.length ? pitches[0] : undefined;
    const units = obs.hierarchy.map((u, i) => {
      const facing = u.facing?.length ? u.facing : (u.dir != null ? [u.dir] : []);
      const gathered = readings.filter((r) => facing.includes(r.dir)); // 器へ Observation を集約
      return resolveUnit(u, `R${i + 1}`, gathered, mainPitch);
    });
    return buildRoofConfiguration(units);
  }

  // フォールバック（器が観測できない）：方位別の軒の出を eave 辺に、面数＝geometry優先→異勾配数で器を仮生成。
  const eaveEdges: EdgeConfig[] = readings
    .filter((r) => r.overhangs.length)
    .map((r) => ({ role: 'eave', dir: r.dir, overhang: Math.min(...r.overhangs) }));
  const nRoofs = (obs.faceCount && obs.faceCount > 0) ? obs.faceCount : (pitches.length || 1);
  const units: RoofUnit[] = Array.from({ length: nRoofs }, (_, i) => ({
    id: `R${i + 1}`,
    ...(pitches.length ? { slope: pitches[Math.min(i, pitches.length - 1)] } : {}),
    ...(eaveEdges.length ? { edges: eaveEdges.map((e) => ({ ...e })) } : {}),
  }));
  return buildRoofConfiguration(units);
}
