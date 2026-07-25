// 甍AI Projections — Execution Model を業務成果物へ写す。すべて (Execution)=>T の純関数。
//   ★construction を足さない・数量を作らない。Execution を別レンズ（発注/お金/工程…）で読むだけ。
//   ★Cost は Compiler の最終段ではなく【Projection の一つ】。Schedule/Resource/Carbon/QA/Inspection も同型で足す。
//   ★evidence は必ず継承（発注1行・原価1行が Geometry の要素まで遡れる）。
import type { QuantityEvidence } from './roofModel';
import type { IntentKind } from './materialIntent';
import type { ExecutionModel } from './executionModel';

export type Projection<T> = (exec: ExecutionModel) => T;

// ── 発注（BOM / Procurement Projection）：Execution の全 part を製品(sku)ごとに集約 ──
//   未解決（product=null）は sku=null で surfaced（黙って落とさない）。単位が混在する sku は分けて集計。
export interface OrderLine { sku: string | null; name: string; maker: string | null; kind: IntentKind; qty: number; unit: string; evidence: QuantityEvidence[]; }

export const bomProjection: Projection<OrderLine[]> = (exec) => {
  const groups = new Map<string, OrderLine>(); const order: string[] = [];
  for (const item of exec.items) for (const p of item.parts) {
    const key = (p.product ? p.product.sku : 'UNRESOLVED:' + (p.label ?? p.kind)) + '@' + p.unit;
    let g = groups.get(key);
    if (!g) {
      g = { sku: p.product?.sku ?? null, name: p.product?.name ?? p.label ?? p.kind, maker: p.product?.maker ?? null, kind: p.kind, qty: 0, unit: p.unit, evidence: [] };
      groups.set(key, g); order.push(key);
    }
    g.qty += p.qty; g.evidence.push(...item.evidence);
  }
  return order.map((k) => groups.get(k)!);
};

// ── 原価（Cost Projection）：BOM × 単価。単価不明は unitPrice/cost=null で gap を surfaced ──
export interface PriceBook { unitPrice: Record<string, number>; } // sku → 単価
export interface CostLine extends OrderLine { unitPrice: number | null; cost: number | null; }

export function costProjection(prices?: PriceBook): Projection<CostLine[]> {
  return (exec) => bomProjection(exec).map((line) => {
    const up = line.sku != null ? prices?.unitPrice[line.sku] ?? null : null;
    return { ...line, unitPrice: up, cost: up == null ? null : up * line.qty };
  });
}

// 逆引き：ある要素(id) → どの発注行に効いたか（Studio ハイライト用。Execution まで横断）。
export function orderEvidenceOf(lines: OrderLine[], elementId: string): OrderLine[] {
  return lines.filter((l) => l.evidence.some((e) => e.id === elementId));
}
