// 甍AI Resource Compiler — Execution からの【Domain Compiler】（5つ目のドメイン＝一般性の確認）。
//   決めるもの＝「人・機械・資源の割付」（Resource Decision）。施工体制台帳の素。
//   ★アルゴリズム＝職種別の集約＋班日数化。Cost/Schedule/QA/Carbon と別ドメイン・同じ DomainCompiler<K,IR> 契約。
//   ★Program（職種/歩掛/班編成/機材）を注入・Construction は足さない・Execution read-only・evidence 貫通。
import type { IntentKind } from './materialIntent';
import type { ExecutionModel } from './executionModel';
import type { QuantityEvidence } from './roofModel';

export interface ResourceKnowledge {
  tradeOfKind: Partial<Record<IntentKind, string>>;        // kind → 職種
  laborPerUnit: Partial<Record<IntentKind, number>>;       // kind → 人工/単位（Cost/Schedule とは独立 Program）
  crewSize: Record<string, number>;                        // 職種 → 人/班
  equipmentOfKind: Partial<Record<IntentKind, string[]>>;  // kind → 必要機材
}
export interface TradeResource { trade: string; labor: number; crewSize: number; crewDays: number; evidence: QuantityEvidence[]; }
export interface ResourceIR { trades: TradeResource[]; equipment: { name: string; count: number }[]; totalLabor: number; }

/** Resource Domain Compiler：Execution → 職種別 人工/班日数 ＋ 機材。純関数・Execution read-only。 */
export function resourceCompiler(k: ResourceKnowledge): (exec: ExecutionModel) => ResourceIR {
  return (exec) => {
    // 職種別に 人工 と evidence を集約
    const byTrade = new Map<string, { labor: number; evidence: QuantityEvidence[] }>();
    const equip = new Map<string, number>(); const equipOrder: string[] = [];
    for (const it of exec.items) {
      const trade = k.tradeOfKind[it.kind]; if (!trade) continue;
      const labor = (k.laborPerUnit[it.kind] ?? 0) * it.qty;
      const g = byTrade.get(trade) ?? { labor: 0, evidence: [] };
      g.labor += labor; g.evidence.push(...it.evidence); byTrade.set(trade, g);
      for (const e of k.equipmentOfKind[it.kind] ?? []) { if (!equip.has(e)) equipOrder.push(e); equip.set(e, (equip.get(e) ?? 0) + 1); }
    }
    const trades: TradeResource[] = [...byTrade.entries()].map(([trade, g]) => {
      const cs = k.crewSize[trade] ?? 1;
      return { trade, labor: g.labor, crewSize: cs, crewDays: g.labor / cs, evidence: g.evidence };
    });
    const totalLabor = trades.reduce((s, t) => s + t.labor, 0);
    return { trades, equipment: equipOrder.map((name) => ({ name, count: equip.get(name)! })), totalLabor };
  };
}
