// 甍AI Material IR — 施工意図（Intent）。Geometry Runtime と Material 世界の【境界＝Compiler Boundary】。
//   ★Geometry世界は製品名を一切知らない。ここで出すのは「縦の排水がある(vertical_drain, φ60)」という【意図】だけ。
//     （Drain Runtime が『竪樋』を保存せず Edge の向きから派生するのと同じ規律の一段上：Material は maker/sku を持たない）
//   ★Intent は要素ごと（数量 evidence 1件 = Intent 1件）＝ ID の糸を要素単位で保つ。Product/Assembly/Cost まで evidence が貫通。
//   ★attrs(diameter/color/style…)は「施工の決定」＝将来 Model要素属性(Element.extensions)に保存。ここでは taxonomy の既定値。
import type { QuantityResult, QuantityEvidence } from './roofModel';

// 施工意図の種別（Graph上の役割。製品ではない）。鎖樋/化粧樋/内樋 は vertical_drain の attrs.style 分岐で表す（要 甍 確認）。
export type IntentKind =
  | 'eave_gutter' | 'vertical_drain' | 'connector_drain' | 'outlet' | 'elbow' | 'drain_outlet' // 雨樋（Graph由来）
  | 'roof_field' | 'ridge_cap' | 'hip_cap' | 'valley_flashing' | 'gable_flashing' | 'eave_flashing' // 屋根（Graph由来）
  | 'support_bracket' | 'pipe_joint' | 'adhesive' | 'screw'; // 付属消耗品（Assembly由来・Graphには現れない）

export type IntentAttrs = Record<string, string | number>;

export interface MaterialIntent {
  kind: IntentKind;              // 施工意図（製品名ではない）
  attrs: IntentAttrs;            // 意図の属性（diameter/color/style/size…）。製品選択の入力
  qty: number;                   // この意図の量（＝由来 evidence の contribution。無加工）
  unit: string;
  evidence: QuantityEvidence[];  // 由来要素（segment/node/gutter_run/drop/edge/face）をそのまま継承
}

// taxonomy：数量key → 意図(kind) と既定属性・単位。knowledge/material/intent.json が canonical。
export interface IntentSpec { quantityKey: string; kind: IntentKind; unit: string; attrs?: IntentAttrs; }
export interface IntentCatalog { id: string; specs: IntentSpec[]; }

/**
 * Geometry IR（数量）→ Material IR（施工意図）。純関数。
 *   要素ごとに Intent を出す（evidence 1件＝Intent 1件）。attrs は taxonomy の既定（将来は要素属性で上書き）。
 *   数量が無い key はスキップ（＝その意図は存在しない）。
 */
export function projectIntents(quantities: QuantityResult[], catalog: IntentCatalog): MaterialIntent[] {
  const byKey = new Map(quantities.map((q) => [q.key, q]));
  const out: MaterialIntent[] = [];
  for (const spec of catalog.specs) {
    const q = byKey.get(spec.quantityKey);
    if (!q) continue;
    for (const ev of q.evidence) out.push({ kind: spec.kind, attrs: spec.attrs ?? {}, qty: ev.contribution, unit: spec.unit, evidence: [ev] });
  }
  return out;
}

// 同 kind＋attrs をまとめる（発注・表示の丸め）。evidence は連結＝根拠は保つ。順序は初出順。
export interface IntentRollup { kind: IntentKind; attrs: IntentAttrs; qty: number; unit: string; evidence: QuantityEvidence[]; }
export function rollupIntents(intents: MaterialIntent[]): IntentRollup[] {
  const groups = new Map<string, IntentRollup>(); const order: string[] = [];
  for (const it of intents) {
    const key = it.kind + '|' + stableAttrs(it.attrs);
    let g = groups.get(key);
    if (!g) { g = { kind: it.kind, attrs: it.attrs, qty: 0, unit: it.unit, evidence: [] }; groups.set(key, g); order.push(key); }
    g.qty += it.qty; g.evidence.push(...it.evidence);
  }
  return order.map((k) => groups.get(k)!);
}
function stableAttrs(a: IntentAttrs): string { return Object.keys(a).sort().map((k) => `${k}=${a[k]}`).join(','); }

/** taxonomy に無い数量key（＝意図へ写せなかった数量）を可視化（黙って落とさない）。 */
export function unmappedQuantityKeys(quantities: QuantityResult[], catalog: IntentCatalog): string[] {
  const mapped = new Set(catalog.specs.map((s) => s.quantityKey));
  return quantities.filter((q) => !mapped.has(q.key)).map((q) => q.key);
}
