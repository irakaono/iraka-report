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
import type { Dir, RoofConfiguration, RoofUnit, EdgeConfig } from './roofConfig';
import { buildRoofConfiguration } from './roofConfig';
export type { Dir } from './roofConfig'; // 方位は Roof Configuration 契約が正（後方互換 re-export）

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

// ── Reconciler（R-3）：複数の Observation を突き合わせて Roof Configuration を作る（割当ではなく統合） ──
//   入力は Observation 群：Reader（立面）＋ Geometry（平面の面数）＋ 真北。
//   推論の芯：異なる勾配は異なる屋根面（東2寸+西4寸→面2つ）。同じ勾配なら同一面かもしれない。
//   ★屋根面は整合の結果として確定する。★Geometry には触れない。返すのは Roof Configuration だけ。
//   第一版（ドラフト）：面数＝geometry優先→無ければ異勾配数。勾配を面へ、方位別の軒の出を eave 辺に。
//   軒辺と雨押え辺の厳密割当・真北整合は R-3 本実装で締める（今は人が確認＝確認ファースト）。
export interface RoofObservations {
  elevations?: ElevationSpec[];   // Reader（立面ごとの読み取り＝Observation）
  faceCount?: number;             // Geometry（平面の面数＝Observation）
  northDeg?: number;              // 真北（方位整合＝Observation）
}
export function reconcileRoofConfig(obs: RoofObservations): RoofConfiguration {
  const readings = obs.elevations ?? [];
  const pitches = Array.from(new Set(readings.flatMap((r) => r.pitches))).sort((a, b) => a - b);
  // 方位別の代表軒の出（最小＝軒寄り）を eave 辺に。辺の厳密割当は R-3 本実装。
  const eaveEdges: EdgeConfig[] = readings
    .filter((r) => r.overhangs.length)
    .map((r) => ({ role: 'eave', dir: r.dir, overhang: Math.min(...r.overhangs) }));
  // 面数の整合：平面の面数があれば優先、無ければ「異なる勾配の数」を面数の証拠とする。
  const nRoofs = (obs.faceCount && obs.faceCount > 0) ? obs.faceCount : (pitches.length || 1);
  const units: RoofUnit[] = Array.from({ length: nRoofs }, (_, i) => ({
    id: `R${i + 1}`,
    ...(pitches.length ? { slope: pitches[Math.min(i, pitches.length - 1)] } : {}),
    ...(eaveEdges.length ? { edges: eaveEdges.map((e) => ({ ...e })) } : {}),
  }));
  return buildRoofConfiguration(units);
}
