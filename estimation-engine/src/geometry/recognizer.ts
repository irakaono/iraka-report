// 甍AI Recognizer（図面→Configuration の翻訳器）— 原則21：Recognizer は Provider の一つ。
//   責務：図面を読み、宣言的な RoofConfig（Configuration）を返す。Geometry は作らない・知らない。
//   ★不変条件：Recognizer は Geometry を知らない／Geometry は Recognizer を知らない。契約は Configuration のみ。
//   Recognizer は Reader（生の値）と Resolver（建築知識→Configuration）に分ける：
//     PDF → [Reader] readElevation → 生の値(立面ごと) → [Resolver] resolveRoofConfig → RoofConfig
//   Reader は OCR/抽出が変わっても壊れない。Resolver は建築知識だけ。
//   正の設計：claude/RECOGNIZER-ARCHITECTURE.md（R-1 契約 / R-2 Reader / R-3 Resolver）。

export type Dir = 'south' | 'east' | 'north' | 'west';
export const DIR_JP: Record<string, Dir> = { 南: 'south', 東: 'east', 北: 'north', 西: 'west' };

// Recognizer の戻り値（Geometry との唯一の seam）。宣言的・方位キー。
export interface RoofSpec {
  id: string;
  slope?: number;                          // 寸
  eave?: Partial<Record<Dir, number>>;     // 方位→軒の出(mm)
  ridge?: Partial<Record<Dir, number>>;    // 片棟（水上の棟包み）位置→寸法(mm)
  flashing?: Partial<Record<Dir, boolean>>;// 雨押え（水上が壁）
}
export interface RoofConfig { roofs: RoofSpec[] }

// STEP2：立面ごとに読めた仕様（座標グルーピングの生結果）。STEP3 でこれを RoofConfig へ束ねる。
export interface ElevationSpec { dir: Dir; pitches: number[]; overhangs: number[] }

export interface RecoToken { str: string; x: number; y: number }

const OVERHANG_LABEL = /軒先|軒の出|軒出|樋先|けらば|ケラバ|妻/;
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
  const byDir = new Map<Dir, { pitches: Set<number>; overhangs: Set<number> }>();
  const get = (d: Dir) => { let e = byDir.get(d); if (!e) { e = { pitches: new Set(), overhangs: new Set() }; byDir.set(d, e); } return e; };

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
  return (['south', 'east', 'north', 'west'] as Dir[])
    .filter((d) => byDir.has(d))
    .map((d) => ({ dir: d, pitches: [...byDir.get(d)!.pitches].sort((a, b) => a - b), overhangs: [...byDir.get(d)!.overhangs].sort((a, b) => a - b) }));
}

// ── Resolver（R-3 第一版・ドラフト）：生の立面値 → RoofConfig（建築知識） ──
//   正直な限界：どの軒の出がどの辺かの厳密割当は、平面の面数・真北・ドメイン規則が要る（R-3 本実装で締める）。
//   第一版は「異なる勾配ごとに1つの屋根」を作り、読めた勾配・軒の出候補をドラフトとして束ねる（人が確認＝確認ファースト）。
//   ★Geometry には触れない。返すのは Configuration だけ。
export function resolveRoofConfig(readings: ElevationSpec[]): RoofConfig {
  const pitches = Array.from(new Set(readings.flatMap((r) => r.pitches))).sort((a, b) => a - b);
  const eaveByDir: Partial<Record<Dir, number>> = {};
  for (const r of readings) { if (r.overhangs.length) eaveByDir[r.dir] = Math.min(...r.overhangs); } // 代表値（最小＝軒寄り）。詳細割当はR-3本実装。
  const roofs: RoofSpec[] = (pitches.length ? pitches : [undefined]).map((slope, i) => ({
    id: `R${i + 1}`,
    ...(slope != null ? { slope } : {}),
    ...(Object.keys(eaveByDir).length ? { eave: { ...eaveByDir } } : {}),
  }));
  return { roofs };
}
