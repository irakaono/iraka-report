// 甍AI QA/Inspection Compiler — Execution からの【Domain Compiler】。Cost/Schedule と同じ契約・アルゴリズムは Rule Engine。
//   ★足し算(Cost)でもグラフ(Schedule)でもなく【述語評価（Rule Engine）】。同じ DomainCompiler<K,IR> に収まる＝契約はアルゴリズム中立。
//   ★Domain Program（検査規則）を注入するが Construction は足さない。Execution read-only・evidence 貫通。
//   ★注：ここは「計画」の検査（Execution を規則で判定）。出来形（as-built 実測）検査は将来 field data を別入力に足す。
import type { IntentKind } from './materialIntent';
import type { ExecutionModel } from './executionModel';
import type { QuantityEvidence } from './roofModel';

export type QAMetric = 'kind_count' | 'kind_total_qty';
export type QAOp = '>=' | '<=' | '==' | '>' | '<';
export interface QARule { id: string; label: string; kind: IntentKind; metric: QAMetric; op: QAOp; threshold: number; severity: 'error' | 'warning'; }
export interface QAKnowledge { rules: QARule[]; }

export interface InspectionCheck {
  id: string; label: string; kind: IntentKind; metric: QAMetric;
  actual: number; op: QAOp; threshold: number; pass: boolean; severity: 'error' | 'warning';
  evidence: QuantityEvidence[];
}
export interface InspectionIR { checks: InspectionCheck[]; passCount: number; failCount: number; allPass: boolean; }

function metricValue(exec: ExecutionModel, kind: IntentKind, metric: QAMetric): { value: number; evidence: QuantityEvidence[] } {
  const items = exec.items.filter((i) => i.kind === kind);
  const evidence = items.flatMap((i) => i.evidence);
  return { value: metric === 'kind_count' ? items.length : items.reduce((s, i) => s + i.qty, 0), evidence };
}
function cmp(a: number, op: QAOp, b: number): boolean {
  switch (op) { case '>=': return a >= b; case '<=': return a <= b; case '==': return a === b; case '>': return a > b; case '<': return a < b; }
}

/** QA Domain Compiler：Execution を検査規則で判定 → Inspection IR。純関数・Execution read-only。 */
export function qaCompiler(k: QAKnowledge): (exec: ExecutionModel) => InspectionIR {
  return (exec) => {
    const checks: InspectionCheck[] = k.rules.map((r) => {
      const { value, evidence } = metricValue(exec, r.kind, r.metric);
      return { id: r.id, label: r.label, kind: r.kind, metric: r.metric, actual: value, op: r.op, threshold: r.threshold, pass: cmp(value, r.op, r.threshold), severity: r.severity, evidence };
    });
    const failCount = checks.filter((c) => !c.pass).length;
    return { checks, passCount: checks.length - failCount, failCount, allPass: failCount === 0 };
  };
}
