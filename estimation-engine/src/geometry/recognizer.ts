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

// ── Reconciler（R-3）：複数の Observation を突き合わせて Roof Configuration を作る（割当ではなく統合） ──
//   入力は Observation 群：Reader（立面）＋ Geometry（平面の面数）＋ 真北 ＋ 屋根系統（建物の階層構造）。
//   ★確定の単位は「面」ではなく「系統（Roof Unit）」＝屋根屋が現場で数える単位（主屋根→東下屋→西下屋）。
//     1系統は1面の片流れのことも、複数面の寄棟のこともある。この単位なら複雑な屋根も自然に拡張できる。
//   真北の優先：①平面の北矢印（最も信頼）②立面の名称（南/東立面）③不一致は確認カードで質問。
//   推論の芯：屋根系統があれば「系統ごとに確定」。無ければ 面数（geometry優先→異勾配数）へフォールバック。
export interface RoofUnitObservation {
  role: RoofUnitRole;   // 主屋根/下屋/玄関下屋（平面の階層構造から観測）
  dir?: Dir;            // その系統が主に面する方位（立面の読みと突き合わせる鍵）
  name?: string;        // 人が読む名（「東下屋」など）
}
export interface RoofObservations {
  elevations?: ElevationSpec[];       // Reader（立面ごとの読み取り＝Observation）
  faceCount?: number;                 // Geometry（平面の面数＝Observation）
  northDeg?: number;                  // 真北（方位整合＝Observation・優先①北矢印）
  hierarchy?: RoofUnitObservation[];  // 屋根系統（建物の階層構造＝Observation。主屋根＋下屋…）
}
export function reconcileRoofConfig(obs: RoofObservations): RoofConfiguration {
  const readings = obs.elevations ?? [];
  const pitches = Array.from(new Set(readings.flatMap((r) => r.pitches))).sort((a, b) => a - b);
  // 方位別の代表値（勾配は最初の読み・軒の出は最小＝軒寄り）。系統を立面へ突き合わせる索引。
  const dirPitch = new Map<Dir, number>();
  const dirOverhang = new Map<Dir, number>();
  for (const r of readings) {
    if (r.pitches.length && !dirPitch.has(r.dir)) dirPitch.set(r.dir, r.pitches[0]);
    if (r.overhangs.length) dirOverhang.set(r.dir, Math.min(...r.overhangs));
  }
  // 水上の納まり既定（WITHDOM＝片棟/軒 仕様）：主屋根＝つかみ込み（壁に当たらない片棟）／下屋・玄関下屋＝雨押え（壁有）。
  const topRole = (role: RoofUnitRole): EdgeConfig['role'] => (role === 'main' ? 'grip' : 'flashing');

  // ★屋根系統があれば「系統（Roof Unit）ごとに確定」。これが本筋。
  if (obs.hierarchy && obs.hierarchy.length) {
    const mainPitch = pitches.length ? pitches[0] : undefined;
    const units: RoofUnit[] = obs.hierarchy.map((h, i) => {
      const slope = (h.dir != null ? dirPitch.get(h.dir) : undefined) ?? mainPitch;
      const edges: EdgeConfig[] = [];
      if (h.dir != null) { const ov = dirOverhang.get(h.dir); edges.push({ role: 'eave', dir: h.dir, ...(ov != null ? { overhang: ov } : {}) }); }
      edges.push({ role: topRole(h.role) }); // 水上（軒の対辺）の納まり
      return { id: `R${i + 1}`, role: h.role, ...(h.name ? { name: h.name } : {}), ...(slope != null ? { slope } : {}), edges };
    });
    return buildRoofConfiguration(units);
  }

  // フォールバック（系統未観測）：方位別の軒の出を eave 辺に、面数＝geometry優先→異勾配数。
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
