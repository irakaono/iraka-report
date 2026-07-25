// 甍AI Material Adapter — 数量 → Material IR(Intent) → Product の2段パイプライン（STEP5）。
//   Compiler Pipeline の Optimization フェーズ。Runtime ではない（Command/Reducer を持たない）。
//   ★境界（Compiler Boundary）：Geometry世界は製品を知らない。Intent(施工意図)だけを出し、Product は Rule Engine が解決。
//     materialIntent.ts … Geometry IR → Material IR（意図・製品名を持たない）
//     productCatalog.ts … Material IR → Product（IF Intent THEN Product。maker 差し替えで IR 不変）
//   ★Material も Evidence First：Intent/Product とも evidence(segment/node/gutter_run/drop/edge/face)を継承＝ID の糸が貫通。
//   ★Adapter は写すだけ：定尺分割/歩掛/単価/付属部材は書かない（＝STEP6 の MaterialTransform / Assembly / Cost 層）。
import type { QuantityResult } from './roofModel';
import { projectIntents, rollupIntents } from './materialIntent';
import type { IntentCatalog } from './materialIntent';
import { resolveMaterials } from './productCatalog';
import type { ProductCatalog, ResolvedMaterial } from './productCatalog';
import { toExecution } from './executionModel';
import type { AssemblyCatalog, ExecutionModel } from './executionModel';

/**
 * Geometry IR(数量) → Intent(要素ごと) → 丸め(発注単位) → Product解決。ResolvedMaterial[]（＝Procurement）を返す。
 * 純関数：数量・catalog を入力に、部材（製品）を毎回派生する（保存しない）。
 */
export function compileMaterials(quantities: QuantityResult[], intents: IntentCatalog, products: ProductCatalog): ResolvedMaterial[] {
  return resolveMaterials(rollupIntents(projectIntents(quantities, intents)), products);
}

/**
 * Compiler 終点：数量 → Intent → Product → Execution Model（実行計画）。
 * assembly（付属部材 Knowledge）が無ければ主部材のみの pass-through。以降は Projection（projection.ts）で業務成果物へ。
 */
export function compileExecution(quantities: QuantityResult[], intents: IntentCatalog, products: ProductCatalog, assembly?: AssemblyCatalog): ExecutionModel {
  return toExecution(compileMaterials(quantities, intents, products), assembly, products);
}

// 段ごとの純関数も公開（Studio/テスト/将来の Assembly・Cost 層が各段を個別に使う）。
export { projectIntents, rollupIntents, unmappedQuantityKeys } from './materialIntent';
export type { MaterialIntent, IntentKind, IntentAttrs, IntentSpec, IntentCatalog, IntentRollup } from './materialIntent';
export { resolveProduct, resolveMaterials, unresolvedMaterials, materialEvidenceOf } from './productCatalog';
export type { Product, ProductRule, ProductCatalog, ResolvedMaterial } from './productCatalog';
export { toExecution } from './executionModel';
export type { ExecutionModel, ExecutionItem, ExecutionPart, AssemblyCatalog, AssemblyRule } from './executionModel';
export { bomProjection, costProjection, orderEvidenceOf } from './projection';
export type { Projection, OrderLine, CostLine, PriceBook } from './projection';
export { costCompiler } from './costCompiler';
export type { CostKnowledge, LaborBook, Estimate, MaterialCostLine, LaborCostLine } from './costCompiler';
export { costCompile, bomCompile, scheduleCompile, qaCompile, carbonCompile, resourceCompile } from './domainCompiler';
export type { DomainCompiler, IdentityCompiler, PresentationAdapter, EstimateIR, OrderIR, ScheduleIR } from './domainCompiler';
export { resourceCompiler } from './resourceCompiler';
export type { ResourceKnowledge, ResourceIR, TradeResource } from './resourceCompiler';
export { scheduleCompiler } from './scheduleCompiler';
export type { ScheduleKnowledge, TaskGraphIR, Task } from './scheduleCompiler';
export { qaCompiler } from './qaCompiler';
export type { QAKnowledge, QARule, InspectionIR, InspectionCheck } from './qaCompiler';
export { carbonCompiler } from './carbonCompiler';
export type { CarbonKnowledge, CarbonIR, CarbonLine } from './carbonCompiler';
export { estimateToRows, estimateToCsv, orderToCsv, taskGraphToRows, inspectionToRows, carbonToRows, resourceToRows } from './presentation';
export type { AmountRow, TaskRow, CheckRow, CarbonRow, TradeRow } from './presentation';
