// 甍AI Cost Compiler — Execution からの【Domain Compiler】（Projection の多段版）。
//   ★Execution 以降の分岐の1つ。純Projection(bomProjection)と違い、Domain 知識（単価/歩掛/経費率）を注入する。
//     ただし【Construction は足さない】：何を施工するかは Execution が唯一の真実。ここはお金への解釈だけ。
//   ★多段：材料費 → 労務費 → 間接費 → 見積（Estimate）。各段が evidence を継承（見積1行が Geometry まで遡れる）。
//   ★Execution にしか依存しない（Geometry も他 Domain も見ない）＝ Compiler of Compilers の条件。
import type { IntentKind } from './materialIntent';
import type { ExecutionModel } from './executionModel';
import type { QuantityEvidence } from './roofModel';
import { bomProjection } from './projection';
import type { PriceBook, OrderLine } from './projection';

// Domain 知識（Construction ではない）。
export interface LaborBook { wagePerLabor: number; laborPerUnit: Partial<Record<IntentKind, number>>; } // 円/人工・人工/単位
export interface CostKnowledge { prices: PriceBook; labor: LaborBook; indirectRate: number; }

export interface MaterialCostLine extends OrderLine { unitPrice: number | null; cost: number | null; }
export interface LaborCostLine { kind: IntentKind; operation: string; qty: number; unit: string; labor: number; cost: number; evidence: QuantityEvidence[]; }
export interface Estimate {
  materials: MaterialCostLine[];   // 材料費 IR
  labor: LaborCostLine[];          // 労務費 IR
  materialCost: number; laborCost: number; directCost: number; indirectCost: number; total: number;
  unresolvedSkus: string[];        // 単価が引けなかった sku（gap を surfaced）
}

/** Cost Domain Compiler：Execution → Estimate。多段（材料→労務→間接）。純関数。 */
export function costCompiler(k: CostKnowledge): (exec: ExecutionModel) => Estimate {
  return (exec) => {
    // 段1：材料費 = BOM(発注) × 単価。単価不明は cost=null で surfaced。
    const materials: MaterialCostLine[] = bomProjection(exec).map((l) => {
      const up = l.sku != null ? k.prices.unitPrice[l.sku] ?? null : null;
      return { ...l, unitPrice: up, cost: up == null ? null : up * l.qty };
    });
    const materialCost = materials.reduce((s, l) => s + (l.cost ?? 0), 0);

    // 段2：労務費 = 操作量 × 歩掛(人工/単位) × 労務単価。evidence は Execution item から継承。
    const labor: LaborCostLine[] = exec.items.map((it) => {
      const nk = (k.labor.laborPerUnit[it.kind] ?? 0) * it.qty;
      return { kind: it.kind, operation: it.operation, qty: it.qty, unit: it.unit, labor: nk, cost: nk * k.labor.wagePerLabor, evidence: it.evidence };
    }).filter((l) => l.labor > 0);
    const laborCost = labor.reduce((s, l) => s + l.cost, 0);

    // 段3：間接費 = 直接費 × 経費率 → 見積
    const directCost = materialCost + laborCost;
    const indirectCost = directCost * k.indirectRate;
    const total = directCost + indirectCost;

    const unresolvedSkus = materials.filter((l) => l.sku != null && l.cost == null).map((l) => l.sku!);
    return { materials, labor, materialCost, laborCost, directCost, indirectCost, total, unresolvedSkus };
  };
}
