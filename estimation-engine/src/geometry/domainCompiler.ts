// 甍AI Domain Compiler — 一般契約（Compiler of Compilers の共通形）。
//   ★DomainCompiler：Execution + Knowledge → Domain IR。Cost/Schedule/Carbon/QA が全部この形。
//   ★Presentation Adapter は【分離】：1つの Domain IR から Excel/PDF/CSV/API/画面 へ何枚でも投影（open set）。
//     compile に OUT を同居させない＝新 Adapter 追加で compiler を触らない。Adapter は IR を変えない（表示だけ）。
//   ★BOM は Knowledge 不要＝Identity Compiler（K=void）。
import type { ExecutionModel } from './executionModel';
import type { OrderLine } from './projection';
import { bomProjection } from './projection';
import { costCompiler } from './costCompiler';
import type { CostKnowledge, Estimate } from './costCompiler';
import { scheduleCompiler } from './scheduleCompiler';
import type { ScheduleKnowledge, TaskGraphIR } from './scheduleCompiler';
import { qaCompiler } from './qaCompiler';
import type { QAKnowledge, InspectionIR } from './qaCompiler';
import { carbonCompiler } from './carbonCompiler';
import type { CarbonKnowledge, CarbonIR } from './carbonCompiler';
import { resourceCompiler } from './resourceCompiler';
import type { ResourceKnowledge, ResourceIR } from './resourceCompiler';

// ── 一般契約 ──
export type DomainCompiler<K, IR> = (exec: ExecutionModel, knowledge: K) => IR;  // Execution + Knowledge → Domain IR
export type IdentityCompiler<IR> = (exec: ExecutionModel) => IR;                  // Knowledge 不要（BOM）
export type PresentationAdapter<IR, OUT> = (ir: IR) => OUT;                       // Domain IR → 表示（読むだけ・IR を変えない）

// ── 具体1：Cost（Knowledge 有り）→ Estimate IR（材料費/労務費/間接費/合計/原価構造/evidence） ──
export type EstimateIR = Estimate;
export const costCompile: DomainCompiler<CostKnowledge, EstimateIR> = (exec, k) => costCompiler(k)(exec);

// ── 具体2：BOM（Identity＝Knowledge 不要）→ Order IR ──
export interface OrderIR { lines: OrderLine[]; }
export const bomCompile: IdentityCompiler<OrderIR> = (exec) => ({ lines: bomProjection(exec) });

// ── 具体3：Schedule → TaskGraph IR。アルゴリズム＝Graph+CPM（Cost の足し算と別）。 ──
export type ScheduleIR = TaskGraphIR;
export const scheduleCompile: DomainCompiler<ScheduleKnowledge, ScheduleIR> = (exec, k) => scheduleCompiler(k)(exec);

// ── 具体4：QA → Inspection IR。アルゴリズム＝Rule Engine（述語評価）。 ──
export const qaCompile: DomainCompiler<QAKnowledge, InspectionIR> = (exec, k) => qaCompiler(k)(exec);

// ── 具体5：Carbon → Carbon IR。アルゴリズム＝多段集約（材料→輸送→施工）。 ──
export const carbonCompile: DomainCompiler<CarbonKnowledge, CarbonIR> = (exec, k) => carbonCompiler(k)(exec);

// ── 具体6：Resource → Resource IR。アルゴリズム＝職種別集約＋班日数化（施工体制台帳の素）。 ──
export const resourceCompile: DomainCompiler<ResourceKnowledge, ResourceIR> = (exec, k) => resourceCompiler(k)(exec);
// ＝アルゴリズム5種（Reduction / Graph+CPM / Rule Engine / 多段集約 / 職種集約）が同一契約に収束＝契約はアルゴリズム中立。
// なお各 Domain IR（Estimate/TaskGraph/Inspection/Carbon/Resource）は「Decision の特殊形」とも読める（説明モデル・共通 DecisionIR 型は導入しない）。
