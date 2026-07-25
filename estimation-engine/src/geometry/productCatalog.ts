// 甍AI Product Catalog — Rule Engine（IF Intent THEN Product）。Material IR → 製品への写像だけ。
//   ★maker/series/sku はここにしか現れない。Panasonic→セキスイ→タニタ は【この rules 差し替えだけ】で Material IR は不変。
//   ★写すだけ：歩掛/人工/単価は書かない（Cost層）。付属部材(支持金具/接着剤/ビス/ジョイント)展開は Assembly層。
import type { IntentKind, IntentAttrs, MaterialIntent, IntentRollup } from './materialIntent';
import type { QuantityEvidence } from './roofModel';

export interface Product { maker: string; series: string; sku: string; name: string; unit: string; }
export interface ProductRule { when: { kind: IntentKind; match?: IntentAttrs }; product: Product; }
export interface ProductCatalog { id: string; maker?: string; rules: ProductRule[]; }

/** Rule Engine：意図に最初に一致した rule の製品を返す。無ければ null（未解決＝黙って落とさない）。
 *   match は「指定キーが全て一致」で判定（部分一致＝より特殊な rule を上に置けば優先される）。 */
export function resolveProduct(intent: { kind: IntentKind; attrs: IntentAttrs }, catalog: ProductCatalog): Product | null {
  for (const r of catalog.rules) {
    if (r.when.kind !== intent.kind) continue;
    const m = r.when.match;
    if (m && !Object.keys(m).every((k) => intent.attrs[k] === m[k])) continue;
    return r.product;
  }
  return null;
}

// 発注行：意図＋解決した製品。product=null は未解決（Rule 不足＝Knowledge 追記が要る）。
export interface ResolvedMaterial { kind: IntentKind; attrs: IntentAttrs; qty: number; unit: string; product: Product | null; evidence: QuantityEvidence[]; }

/** Intent（丸め済み or 生）→ 製品解決。既定は rollup（発注単位）を渡す。 */
export function resolveMaterials(intents: (MaterialIntent | IntentRollup)[], catalog: ProductCatalog): ResolvedMaterial[] {
  return intents.map((it) => ({ kind: it.kind, attrs: it.attrs, qty: it.qty, unit: it.unit, product: resolveProduct(it, catalog), evidence: it.evidence }));
}

/** 未解決（製品が引けなかった意図）＝可視化して Knowledge 追記を促す。 */
export function unresolvedMaterials(resolved: ResolvedMaterial[]): ResolvedMaterial[] { return resolved.filter((r) => r.product === null); }

/** 逆引き：要素(id) → どの部材へ効いたか（Studio ハイライト用。Quantity/Intent と横断）。 */
export function materialEvidenceOf(resolved: ResolvedMaterial[], elementId: string): { kind: IntentKind; product: Product | null; contribution: number; unit: string }[] {
  const hits: { kind: IntentKind; product: Product | null; contribution: number; unit: string }[] = [];
  for (const m of resolved) for (const ev of m.evidence) if (ev.id === elementId) hits.push({ kind: m.kind, product: m.product, contribution: ev.contribution, unit: m.unit });
  return hits;
}
