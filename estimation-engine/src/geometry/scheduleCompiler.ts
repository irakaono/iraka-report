// 甍AI Schedule Compiler — Execution からの【Domain Compiler】。Cost と同じ契約・全く違うIR（グラフ＋クリティカルパス）。
//   ★これが同じ DomainCompiler<K,IR> に収まる＝契約の一般化可能性の証明（足し算の Cost と違い、Task Graph + CPM）。
//   ★Domain Program（順序制約/工数）を注入するが Construction は足さない。Execution read-only・evidence 貫通。
import type { IntentKind } from './materialIntent';
import type { ExecutionModel } from './executionModel';
import type { QuantityEvidence } from './roofModel';

// Domain Program（IR ではない＝Compiler を構成する規則。将来 version 管理）。
export interface ScheduleKnowledge {
  durationPerUnit: Partial<Record<IntentKind, number>>;      // 単位あたり工数（人日）
  precedence: { before: IntentKind; after: IntentKind }[];   // 施工順序（before が終わってから after）
}

// Schedule Domain IR：Task Graph（＋CPM 結果）。
export interface Task {
  id: string; kind: IntentKind; operation: string; duration: number;
  deps: string[]; earliestStart: number; earliestFinish: number; critical: boolean;
  evidence: QuantityEvidence[];
}
export interface TaskGraphIR { tasks: Task[]; totalDuration: number; criticalPath: string[]; }

/** Schedule Domain Compiler：Execution → Task Graph（CPM）。純関数・Execution read-only。 */
export function scheduleCompiler(k: ScheduleKnowledge): (exec: ExecutionModel) => TaskGraphIR {
  return (exec) => {
    // タスク生成：1 Execution item = 1 タスク（工数＝量×工数原単位）。
    const tasks = exec.items.map((it, i) => ({
      id: it.kind + '#' + i, kind: it.kind, operation: it.operation,
      duration: (k.durationPerUnit[it.kind] ?? 0) * it.qty,
      deps: [] as string[], evidence: it.evidence,
    }));
    const byKind = new Map<IntentKind, string[]>();
    for (const t of tasks) { const a = byKind.get(t.kind) ?? []; a.push(t.id); byKind.set(t.kind, a); }
    // 依存：precedence（before の全タスク → after の全タスク）
    for (const r of k.precedence) {
      const befores = byKind.get(r.before) ?? []; const afters = byKind.get(r.after) ?? [];
      for (const af of afters) { const t = tasks.find((x) => x.id === af)!; for (const b of befores) if (!t.deps.includes(b)) t.deps.push(b); }
    }
    // 前進パス（Kahn トポロジカル順で ES/EF）
    const tmap = new Map(tasks.map((t) => [t.id, t]));
    const succ = new Map<string, string[]>(); tasks.forEach((t) => succ.set(t.id, []));
    for (const t of tasks) for (const d of t.deps) succ.get(d)?.push(t.id);
    const indeg = new Map(tasks.map((t) => [t.id, t.deps.length]));
    const queue = tasks.filter((t) => t.deps.length === 0).map((t) => t.id);
    const ES = new Map<string, number>(); const EF = new Map<string, number>(); const order: string[] = [];
    while (queue.length) {
      const id = queue.shift()!; order.push(id); const t = tmap.get(id)!;
      const es = t.deps.length ? Math.max(...t.deps.map((d) => EF.get(d) ?? 0)) : 0;
      ES.set(id, es); EF.set(id, es + t.duration);
      for (const s of succ.get(id) ?? []) { indeg.set(s, (indeg.get(s) ?? 0) - 1); if (indeg.get(s) === 0) queue.push(s); }
    }
    const totalDuration = tasks.length ? Math.max(...tasks.map((t) => EF.get(t.id) ?? 0)) : 0;
    // 後退パス（LF/LS）→ float 0 = クリティカル
    const LF = new Map<string, number>();
    for (const id of [...order].reverse()) {
      const t = tmap.get(id)!; const ss = succ.get(id) ?? [];
      const lf = ss.length ? Math.min(...ss.map((s) => (LF.get(s) ?? totalDuration) - (tmap.get(s)!.duration))) : totalDuration;
      LF.set(id, lf);
    }
    const result: Task[] = tasks.map((t) => ({
      ...t, earliestStart: ES.get(t.id) ?? 0, earliestFinish: EF.get(t.id) ?? 0,
      critical: Math.abs((LF.get(t.id) ?? 0) - (EF.get(t.id) ?? 0)) < 1e-9,
    }));
    const criticalPath = result.filter((t) => t.critical).sort((a, b) => a.earliestStart - b.earliestStart).map((t) => t.id);
    return { tasks: result, totalDuration, criticalPath };
  };
}
