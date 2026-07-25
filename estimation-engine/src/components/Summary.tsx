// 集計（Result Envelope）e0.3.5②: 工種×積算項目ごとの数量。行を開くと根拠の拾いへ、クリックでジャンプ。
// 画面は「屋根工事 / 立平333 / 226.54㎡」だが、裏は常に measurementIds（根拠）を持つ＝Summary も Evidence。
import type { SummaryResult, MQ } from '../geometry/summary';

interface Props {
  summaries: SummaryResult[];
  mqById: Record<string, MQ>;
  onJump: (measurementId: string) => void; // 根拠の拾いへジャンプ（→図面→vertices まで戻れる）
}

export default function Summary(props: Props) {
  // 概算数量（合計）: 単位ごとに合算（㎡ と m を混ぜない）。勾配込みの実数量。
  const totals: Record<string, number> = {};
  for (const s of props.summaries) totals[s.unit] = (totals[s.unit] ?? 0) + s.quantity;
  const totalUnits = Object.keys(totals);

  return (
    <div className="panel summary">
      <h3>集計（数量）</h3>

      {props.summaries.length === 0 && (
        <div className="list-empty">拾いを保存すると、工種・積算項目ごとに自動集計します（保存はされません＝毎回再計算）。</div>
      )}

      {totalUnits.length > 0 && (
        <div className="sum-total">
          <span className="sum-total-label">概算数量（合計）</span>
          <span className="sum-total-vals">
            {totalUnits.map((u) => (
              <b key={u}>{totals[u].toFixed(2)}<small> {u}</small></b>
            ))}
          </span>
        </div>
      )}

      {props.summaries.map((s, i) => (
        <details key={i} className="sum-row">
          <summary>
            <span className="sum-head">
              <span className="sum-trade">{s.trade}</span>
              <span className="sum-item">{s.item}</span>
            </span>
            <span className="sum-qty">{s.quantity.toFixed(2)}<small> {s.unit}</small></span>
          </summary>
          {s.measurementIds.map((id) => {
            const q = props.mqById[id];
            if (!q) return null;
            return (
              <div key={id} className="sum-child" onClick={() => props.onJump(id)} title="この拾いへジャンプ（図面・頂点まで遡れます）">
                <span className="sum-child-label">{q.label}</span>
                <span className="sum-child-qty">{q.actual.toFixed(2)} {q.unit}</span>
              </div>
            );
          })}
        </details>
      ))}
    </div>
  );
}
