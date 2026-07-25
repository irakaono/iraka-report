// 甍AI Execution Model — 実行計画（施工世界 ↔ 業務世界の境界）。Building Compiler の終点。
//   ★Compiler は Execution で終わる。見積/工程/在庫/CO2/品質/検査 は Execution からの Projection（projection.ts）。
//   ★Execution は Canonical だが【派生・保存しない】（保存は幾何＋属性=Model だけ）。
//     幾何から導けない施工決定（支持金具の数・左官指定…）は Model 属性(Element.extensions)に保存し、ここは読むだけ。
//   ★evidence は Geometry→Intent→Product→Execution を貫通（ID の糸）。付属部材(でんでん/ビス…)も竪樋の evidence を継承。
import type { QuantityEvidence } from './roofModel';
import type { IntentKind, IntentAttrs } from './materialIntent';
import { resolveProduct } from './productCatalog';
import type { Product, ProductCatalog, ResolvedMaterial } from './productCatalog';

// 実行計画の部材：主部材(main)＝Procurement で選んだ製品、付属(ancillary)＝でんでん/ジョイント/接着剤/ビス等。
export interface ExecutionPart { product: Product | null; kind: IntentKind; role: 'main' | 'ancillary'; qty: number; unit: string; label?: string; }

export interface ExecutionItem {
  operation: string;            // 施工操作（'竪樋取付'…）。kind から既定命名・将来 Knowledge で上書き
  kind: IntentKind;
  attrs: IntentAttrs;
  qty: number;                  // 操作の量（＝主部材の量。無加工）
  unit: string;
  parts: ExecutionPart[];       // 主部材＋付属部材
  evidence: QuantityEvidence[]; // 由来要素（Geometry まで貫通）
}
export interface ExecutionModel { items: ExecutionItem[]; }

// ── 付属部材の展開ルール（Assembly Knowledge・甍）。basis で非線形も表す ──
//   ★エルボは Graph 由来（Node kind='elbow'）で独立 item になる＝ここで展開しない（二重計上を避ける）。
export type AncillarySpec = { kind: IntentKind; label: string; unit: string; attrs?: IntentAttrs } & (
  | { basis: 'per_main'; factor: number }                          // qty = 主部材量 × factor
  | { basis: 'spacing'; spacingM: number }                         // qty = ceil(主部材長 / ピッチ)（でんでん等）
  | { basis: 'stock'; stockM: number }                             // qty = max(0, ceil(長/定尺) - 1)（定尺継手）
  | { basis: 'per_ancillary'; ofKind: IntentKind; factor: number } // qty = 既算出(ofKind) × factor（ビス=でんでん×2）
);
export interface AssemblyRule { when: { kind: IntentKind }; operation?: string; ancillaries: AncillarySpec[]; }
export interface AssemblyCatalog { id: string; rules: AssemblyRule[]; }

const OP: Partial<Record<IntentKind, string>> = {
  eave_gutter: '軒樋取付', vertical_drain: '竪樋取付', connector_drain: '呼び樋取付',
  outlet: '集水器取付', elbow: 'エルボ取付', drain_outlet: '排水取付',
  roof_field: '屋根葺き', ridge_cap: '棟包み取付', hip_cap: '隅棟包み取付',
  valley_flashing: '谷板取付', gable_flashing: 'ケラバ水切取付', eave_flashing: '軒先水切取付',
};

// 付属量の算出（basis 別）。per_ancillary は宣言順で先に算出済みの付属を参照する。
function ancillaryQty(spec: AncillarySpec, mainQty: number, computed: Map<IntentKind, number>): number {
  switch (spec.basis) {
    case 'per_main': return mainQty * spec.factor;
    case 'spacing': return Math.ceil(mainQty / spec.spacingM);
    case 'stock': return Math.max(0, Math.ceil(mainQty / spec.stockM) - 1);
    case 'per_ancillary': return (computed.get(spec.ofKind) ?? 0) * spec.factor;
  }
}

/**
 * Procurement 結果（ResolvedMaterial[]）→ Execution Model。純関数・派生（保存しない）。
 *   assembly が無ければ主部材のみの pass-through。あれば付属部材を basis で展開し、products があれば付属も Procurement 解決する。
 */
export function toExecution(resolved: ResolvedMaterial[], assembly?: AssemblyCatalog, products?: ProductCatalog): ExecutionModel {
  const items = resolved.map((r): ExecutionItem => {
    const parts: ExecutionPart[] = [{ product: r.product, kind: r.kind, role: 'main', qty: r.qty, unit: r.unit }];
    const rule = assembly?.rules.find((x) => x.when.kind === r.kind);
    if (rule) {
      const computed = new Map<IntentKind, number>();
      for (const a of rule.ancillaries) {
        const qty = ancillaryQty(a, r.qty, computed);
        computed.set(a.kind, qty);
        const product = products ? resolveProduct({ kind: a.kind, attrs: a.attrs ?? {} }, products) : null;
        parts.push({ product, kind: a.kind, role: 'ancillary', qty, unit: a.unit, label: a.label });
      }
    }
    return { operation: rule?.operation ?? OP[r.kind] ?? r.kind, kind: r.kind, attrs: r.attrs, qty: r.qty, unit: r.unit, parts, evidence: r.evidence };
  });
  return { items };
}
