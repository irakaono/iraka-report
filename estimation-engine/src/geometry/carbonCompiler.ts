// 甍AI Carbon Compiler — Execution からの【Domain Compiler】。多段集約（材料CO₂→輸送→施工）。
//   ★Cost と同じ「多段の積み上げ」だが別ドメイン・別 Program。同じ DomainCompiler<K,IR> 契約。
//   ★Domain Program（CO₂原単位/輸送率/施工原単位）を注入・Construction は足さない・Execution read-only・evidence 貫通。
import type { IntentKind } from './materialIntent';
import type { ExecutionModel } from './executionModel';
import type { QuantityEvidence } from './roofModel';
import { bomProjection } from './projection';

export interface CarbonKnowledge {
  co2PerUnit: Record<string, number>;                          // sku → kg-CO₂/単位（材料）
  transportRate: number;                                       // 材料CO₂ × 率（輸送・近似）
  constructionCO2PerUnit: Partial<Record<IntentKind, number>>; // kind → kg-CO₂/単位（施工）
}
export interface CarbonLine { label: string; sku: string | null; co2: number; evidence: QuantityEvidence[]; }
export interface CarbonIR {
  materialLines: CarbonLine[];
  materialCO2: number; transportCO2: number; constructionCO2: number; total: number;
  unpricedSkus: string[]; // 原単位が無い sku（gap を surfaced）
}

/** Carbon Domain Compiler：Execution → CO₂（材料→輸送→施工の多段）。純関数・Execution read-only。 */
export function carbonCompiler(k: CarbonKnowledge): (exec: ExecutionModel) => CarbonIR {
  return (exec) => {
    // 段1：材料CO₂ = BOM × 原単位
    const materialLines: CarbonLine[] = bomProjection(exec).map((l) => {
      const f = l.sku != null ? k.co2PerUnit[l.sku] ?? null : null;
      return { label: l.name, sku: l.sku, co2: f == null ? 0 : f * l.qty, evidence: l.evidence };
    });
    const materialCO2 = materialLines.reduce((s, l) => s + l.co2, 0);
    // 段2：輸送CO₂ = 材料CO₂ × 率（近似）
    const transportCO2 = materialCO2 * k.transportRate;
    // 段3：施工CO₂ = 操作量 × 施工原単位
    const constructionCO2 = exec.items.reduce((s, it) => s + (k.constructionCO2PerUnit[it.kind] ?? 0) * it.qty, 0);
    const total = materialCO2 + transportCO2 + constructionCO2;
    const unpricedSkus = bomProjection(exec).filter((l) => l.sku != null && k.co2PerUnit[l.sku] == null).map((l) => l.sku!);
    return { materialLines, materialCO2, transportCO2, constructionCO2, total, unpricedSkus };
  };
}
