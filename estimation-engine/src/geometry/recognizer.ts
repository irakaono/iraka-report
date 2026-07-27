// 甍AI Recognizer（図面→Roof Configuration の翻訳器）＝Roof Configuration Compiler の入口。
//   ★スコープ：甍AI は屋根専門。ここで扱う Configuration は常に「Roof Configuration」
//     （屋根勾配・軒の出・雨押え・片棟・ケラバ・雨樋・屋根材のみ）。建物全体は 小泉建設AI＝別プロジェクト。
//   正の設計：claude/CONFIGURATION_ARCHITECTURE.md（親）／claude/RECOGNIZER-ARCHITECTURE.md（本章）。
// 原則21：Recognizer は Provider の一つ。
//   責務：図面を読み、宣言的な RoofConfig（Configuration）を返す。Geometry は作らない・知らない。
//   ★不変条件：Recognizer は Geometry を知らない／Geometry は Recognizer を知らない。契約は Configuration のみ。
//   Recognizer は Reader（生の値）と Resolver（建築知識→Roof Configuration）に分ける：
//     PDF → [Reader] readElevation → 生の値(立面ごと) → [Resolver] resolveRoofConfig → RoofConfiguration
//   Reader は OCR/抽出が変わっても壊れない。Resolver は屋根の建築知識だけ。契約＝roofConfig.ts。
//   正の設計：claude/RECOGNIZER-ARCHITECTURE.md（R-1 契約 / R-2 Reader / R-3 Resolver）。
import type { Dir, RoofConfiguration, RoofUnit, EdgeConfig } from './roofConfig';
import { buildRoofConfiguration } from './roofConfig';
export type { Dir } from './roofConfig'; // 方位は Roof Configuration 契約が正（後方互換 re-export）

export const DIR_JP: Record<string, Dir> = { 南: 'south', 東: 'east', 北: 'north', 西: 'west' };

// STEP2：立面ごとに読めた生の値（座標グルーピング）。STEP3 でこれを sub-Compiler が Roof Configuration へ束ねる。
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

// ── Resolver（R-3 第一版・ドラフト）：生の立面値 → RoofConfiguration（屋根の建築知識） ──
//   正直な限界：どの軒の出がどの辺かの厳密割当は、平面の面数・真北・ドメイン規則が要る（R-3 本実装で締める）。
//   第一版は「異なる勾配ごとに1つの屋根」を作り、方位別の軒の出を eave 辺として束ねる（人が確認＝確認ファースト）。
//   ★Geometry には触れない。返すのは Roof Configuration（合成契約）だけ。Builder で束ねる。
export function resolveRoofConfig(readings: ElevationSpec[]): RoofConfiguration {
  const pitches = Array.from(new Set(readings.flatMap((r) => r.pitches))).sort((a, b) => a - b);
  // 方位別の代表軒の出（最小＝軒寄り）を eave 辺に。詳細な辺割当は R-3 本実装。
  const eaveEdges: EdgeConfig[] = readings
    .filter((r) => r.overhangs.length)
    .map((r) => ({ role: 'eave', dir: r.dir, overhang: Math.min(...r.overhangs) }));
  const units: RoofUnit[] = (pitches.length ? pitches : [undefined]).map((slope, i) => ({
    id: `R${i + 1}`,
    ...(slope != null ? { slope } : {}),
    ...(eaveEdges.length ? { edges: eaveEdges.map((e) => ({ ...e })) } : {}),
  }));
  return buildRoofConfiguration(units);
}
