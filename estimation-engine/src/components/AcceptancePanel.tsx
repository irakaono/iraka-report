// Drawing Intelligence Debugger（実証パネル）。
//   Geometry → Quantity → Program を一画面で追い、右下に L0〜L3 の実証状態を出す。
//   ★人トレースでも Recognizer でも同じ画面。将来 Human Geometry Provider → Recognizer Geometry Provider に差し替えても、この Acceptance だけで定量評価できる。
import { useMemo, useState } from 'react';
import type { QuantityResult } from '../geometry/roofModel';
import { runAcceptance, buildBreakdown } from '../geometry/acceptance';
import type { GutterProgram, CaseWork, QuantityBreakdown, DeltaRow } from '../geometry/acceptance';
import casesData from '../../knowledge/validation/cases.json';
import withdomGutter from '../../knowledge/programs/withdom-saitama.gutter.json';

const program = withdomGutter as unknown as GutterProgram;
interface CaseEntry { id: string; customer: string; gutter?: CaseWork }
const cases = (casesData as unknown as { cases: CaseEntry[] }).cases.filter((c) => !!c.gutter);

const G = '#2f9e44', R = '#e03131', GRAY = '#adb5bd';
const chip = (v: boolean | null): { t: string; c: string } => v === null ? { t: '—', c: GRAY } : v ? { t: 'PASS', c: G } : { t: 'FAIL', c: R };

function breakdownToCSV(bd: QuantityBreakdown[]): string {
  const header = ['quantityKey', 'label', 'unit', 'refId', 'role', 'value', 'source', 'confidence'].join(',');
  const rows = bd.flatMap((b) => b.rows.map((r) => [b.key, b.label, b.unit, r.refId, r.role, r.value, r.source, r.confidence].join(',')));
  return [header, ...rows].join('\n');
}

const th: React.CSSProperties = { textAlign: 'left', padding: '2px 6px', fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' };
const td: React.CSSProperties = { padding: '2px 6px', borderBottom: '1px solid #f1f3f5' };
const num: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

export default function AcceptancePanel({ quantities, hasDrawing, calibrated, onClose }: {
  quantities: QuantityResult[]; hasDrawing: boolean; calibrated: boolean; onClose: () => void;
}) {
  const [caseId, setCaseId] = useState<string>(cases.find((c) => c.id === 'mizukami') ? 'mizukami' : (cases[0]?.id ?? ''));
  const theCase = cases.find((c) => c.id === caseId);
  const caseWork = theCase?.gutter;
  const overhead = caseWork?.items.find((i) => i.name === '諸経費')?.amount ?? 0;

  const breakdown = useMemo(() => buildBreakdown(quantities, 'manual', 1.0), [quantities]);
  const report = useMemo(() => caseWork
    ? runAcceptance({ caseId, domain: 'gutter', quantities, program, caseWork, overhead })
    : null, [caseId, quantities, caseWork, overhead]);

  // 実証ラダー
  const gutterQ = quantities.find((q) => q.key === 'gutterLength');
  const L0 = hasDrawing;
  const L05 = calibrated;
  const L1 = !!gutterQ && gutterQ.evidence.length > 0; // Geometry が存在し数量を生んでいる（正解Geometryは無いので内訳ログで診断）
  const L2 = report ? report.l2.length > 0 && report.l2.every((r) => r.verdict === 'PASS') : null;
  const L3 = report ? report.l3.length > 0 && report.l3.every((r) => r.verdict === 'PASS') : null;
  const ladder: Array<{ k: string; label: string; v: boolean | null }> = [
    { k: 'L0', label: '図面表示', v: L0 },
    { k: 'L0.5', label: '較正', v: L05 },
    { k: 'L1', label: 'Geometry', v: L1 },
    { k: 'L2', label: 'Quantity', v: L2 },
    { k: 'L3', label: 'Program', v: L3 },
  ];
  const allPass = ladder.every((x) => x.v === true);

  const exportCSV = () => {
    const csv = breakdownToCSV(breakdown);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `iraka-breakdown-${caseId}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const dRow = (d: DeltaRow) => (
    <tr key={d.level + d.key}>
      <td style={td}>{d.label}</td>
      <td style={num}>{d.engine}{d.unit === '円' ? '' : d.unit}</td>
      <td style={num}>{d.cases}{d.unit === '円' ? '' : d.unit}</td>
      <td style={num}>{d.delta}</td>
      <td style={{ ...td, color: d.verdict === 'PASS' ? G : R, fontWeight: 700, fontSize: 11 }} title={`${d.threshold} / allowed=${d.allowed} / actual=${d.actual}`}>{d.verdict}</td>
    </tr>
  );

  return (
    <div style={{
      position: 'fixed', top: 64, right: 12, width: 380, maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
      background: '#fff', border: '1px solid #ced4da', borderRadius: 10, boxShadow: '0 6px 28px rgba(0,0,0,.22)',
      zIndex: 50, padding: 12, fontSize: 12, fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <strong style={{ fontSize: 13 }}>Drawing Intelligence Debugger</strong>
        <span style={{ flex: 1 }} />
        <button onClick={exportCSV} title="内訳ログをCSVで書き出し" style={{ fontSize: 11 }}>CSV</button>
        <button onClick={onClose} style={{ fontSize: 11 }}>×</button>
      </div>

      {/* Case */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ color: '#868e96' }}>Case</span>
        <select value={caseId} onChange={(e) => setCaseId(e.target.value)} style={{ flex: 1 }}>
          {cases.map((c) => <option key={c.id} value={c.id}>{c.id}（{c.customer}）</option>)}
        </select>
      </div>

      {/* Overall ラダー */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {ladder.map((x) => { const ch = chip(x.v); return (
          <div key={x.k} style={{ flex: 1, textAlign: 'center', border: `1px solid ${ch.c}`, borderRadius: 6, padding: '4px 2px', background: ch.c === G ? '#ebfbee' : ch.c === R ? '#fff5f5' : '#f8f9fa' }}>
            <div style={{ fontSize: 10, color: '#868e96' }}>{x.k}</div>
            <div style={{ fontSize: 9.5, color: '#495057' }}>{x.label}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: ch.c }}>{ch.t}</div>
          </div>
        ); })}
      </div>
      <div style={{ textAlign: 'center', fontWeight: 800, marginBottom: 10, color: allPass ? G : '#868e96' }}>
        {allPass ? '✅ L0〜L3 ALL PASS' : '実証中…（PASSしていない段でどこが原因か辿れます）'}
      </div>

      {/* Geometry：辺ごと内訳ログ */}
      <div style={{ fontWeight: 700, color: '#343a40', margin: '6px 0 2px' }}>Geometry（辺ごと内訳・source/confidence）</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={th}>refId</th><th style={th}>role</th><th style={{ ...th, textAlign: 'right' }}>length</th><th style={th}>src</th><th style={{ ...th, textAlign: 'right' }}>conf</th></tr></thead>
        <tbody>
          {breakdown.flatMap((b) => b.rows).length === 0 && <tr><td style={td} colSpan={5}>まだGeometry無し（Gutter Editで軒樋を配置）</td></tr>}
          {breakdown.map((b) => b.rows.map((r) => (
            <tr key={b.key + r.refId}>
              <td style={td}>{r.refId}</td>
              <td style={td}>{r.role}</td>
              <td style={num}>{r.value}{b.unit}</td>
              <td style={td}>{r.source}</td>
              <td style={num}>{r.confidence}</td>
            </tr>
          )))}
        </tbody>
      </table>

      {/* Quantity：Engine / GT / Δ / verdict（L2） */}
      <div style={{ fontWeight: 700, color: '#343a40', margin: '10px 0 2px' }}>Quantity（L2：max(0.1m,1%) / 個数完全一致）</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={th}>項目</th><th style={{ ...th, textAlign: 'right' }}>Engine</th><th style={{ ...th, textAlign: 'right' }}>GT</th><th style={{ ...th, textAlign: 'right' }}>Δ</th><th style={th}>判定</th></tr></thead>
        <tbody>{report ? report.l2.map(dRow) : <tr><td style={td} colSpan={5}>Case未選択</td></tr>}</tbody>
      </table>

      {/* Program：Engine / GT / verdict（L3・見積） */}
      <div style={{ fontWeight: 700, color: '#343a40', margin: '10px 0 2px' }}>Program（L3：見積・完全一致）<span style={{ color: '#868e96', fontWeight: 400 }}> WITH DOM</span></div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={th}>項目</th><th style={{ ...th, textAlign: 'right' }}>Engine</th><th style={{ ...th, textAlign: 'right' }}>GT</th><th style={{ ...th, textAlign: 'right' }}>Δ</th><th style={th}>判定</th></tr></thead>
        <tbody>{report ? report.l3.map(dRow) : <tr><td style={td} colSpan={5}>Case未選択</td></tr>}</tbody>
      </table>

      <div style={{ marginTop: 8, fontSize: 10.5, color: '#868e96', lineHeight: 1.6 }}>
        Δが緑になるまで「較正 → 軒樋/縦樋/集水器をトレース」。判定セルにカーソルを当てると threshold/allowed/actual を表示。
        将来 Recognizer を載せても、この画面のまま人トレースを差し替えて評価できます。
      </div>
    </div>
  );
}
