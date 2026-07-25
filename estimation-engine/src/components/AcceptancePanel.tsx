// Drawing Intelligence Debugger（実証パネル）。
//   Geometry → Quantity → Program を一画面で追い、右下に L0〜L3 の実証状態を出す。
//   ★人トレースでも Recognizer でも同じ画面。将来 Human Geometry Provider → Recognizer Geometry Provider に差し替えても、この Acceptance だけで定量評価できる。
import { useMemo, useState } from 'react';
import type { QuantityResult, RoofModel } from '../geometry/roofModel';
import type { DrainModel } from '../geometry/drainModel';
import { drainQuantities } from '../geometry/drainQuantities';
import { autoProposeGutter } from '../geometry/autoPropose';
import { runAcceptance, buildBreakdown, classifyGutterItem } from '../geometry/acceptance';
import type { GutterProgram, CaseWork, QuantityBreakdown, DeltaRow } from '../geometry/acceptance';
import casesData from '../../knowledge/validation/cases.json';
import withdomGutter from '../../knowledge/programs/withdom-saitama.gutter.json';

const program = withdomGutter as unknown as GutterProgram;
interface CaseEntry { id: string; customer: string; gutter?: CaseWork }
const cases = (casesData as unknown as { cases: CaseEntry[] }).cases.filter((c) => !!c.gutter);

const G = '#2f9e44', R = '#e03131', GRAY = '#adb5bd';
type St = 'PASS' | 'FAIL' | 'SKIP';
const stColor = (s: St): string => s === 'PASS' ? G : s === 'FAIL' ? R : GRAY;
const stBg = (s: St): string => s === 'PASS' ? '#ebfbee' : s === 'FAIL' ? '#fff5f5' : '#f8f9fa';

// 保存する Run（失敗も成果）。case・L0〜L3・Reason・内訳を残し Failure→Cause→Fix→PASS を追える。
type Decision = 'adopt' | 'hold' | 'reject';
interface AcceptanceRun {
  n: number; at: string; caseId: string; statuses: St[]; note: string;
  comparedAgainst: string | null;   // Run 自身に埋め込む標準器の version（後年も基準が失われない）
  decision: Decision | null;        // 4層目：どう判断したか
  l2: DeltaRow[]; l3: DeltaRow[]; breakdown: QuantityBreakdown[];
}
// Baseline（標準器・ゴールデンサンプル）。合格 Run を固定＝真実。★IMMUTABLE：編集/修正/削除不可、改善は新版を積む。
interface BaselineQ { key: string; label: string; unit: string; value: number }
interface Baseline {
  version: string; caseId: string; provider: 'human' | 'recognizer'; at: string; status: 'IMMUTABLE';
  quantities: BaselineQ[]; breakdown: QuantityBreakdown[];
}
const decisionLabel: Record<Decision, string> = { adopt: '採用', hold: '保留', reject: '却下' };
const round3 = (x: number): number => Math.round(x * 1000) / 1000;

function breakdownToCSV(bd: QuantityBreakdown[]): string {
  const header = ['quantityKey', 'label', 'unit', 'refId', 'role', 'value', 'source', 'confidence'].join(',');
  const rows = bd.flatMap((b) => b.rows.map((r) => [b.key, b.label, b.unit, r.refId, r.role, r.value, r.source, r.confidence].join(',')));
  return [header, ...rows].join('\n');
}

const th: React.CSSProperties = { textAlign: 'left', padding: '2px 6px', fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' };
const td: React.CSSProperties = { padding: '2px 6px', borderBottom: '1px solid #f1f3f5' };
const num: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

export default function AcceptancePanel({ quantities, hasDrawing, calibrated, roofModel, scale, onAdoptDrain, onClose }: {
  quantities: QuantityResult[]; hasDrawing: boolean; calibrated: boolean;
  roofModel: RoofModel; scale: number; onAdoptDrain: (d: DrainModel) => void; onClose: () => void;
}) {
  const [caseId, setCaseId] = useState<string>(cases.find((c) => c.id === 'mizukami') ? 'mizukami' : (cases[0]?.id ?? ''));
  const theCase = cases.find((c) => c.id === caseId);
  const caseWork = theCase?.gutter;
  const overhead = caseWork?.items.find((i) => i.name === '諸経費')?.amount ?? 0;

  const breakdown = useMemo(() => buildBreakdown(quantities, 'manual', 1.0), [quantities]);
  const report = useMemo(() => caseWork
    ? runAcceptance({ caseId, domain: 'gutter', quantities, program, caseWork, overhead })
    : null, [caseId, quantities, caseWork, overhead]);

  // 実証ラダー（見る順番を固定：前段が FAIL なら後段は SKIP）
  const gutterQ = quantities.find((q) => q.key === 'gutterLength');
  const L0 = hasDrawing;
  const L05 = calibrated;
  const L1 = !!gutterQ && gutterQ.evidence.length > 0; // Geometry が存在し数量を生んでいる（正解Geometryは無いので内訳ログで診断）
  const L2 = report ? report.l2.length > 0 && report.l2.every((r) => r.verdict === 'PASS') : false;
  const L3 = report ? report.l3.length > 0 && report.l3.every((r) => r.verdict === 'PASS') : false;
  const base = [
    { k: 'L0', label: '図面', ok: L0 }, { k: 'L0.5', label: '較正', ok: L05 }, { k: 'L1', label: 'Geometry', ok: L1 },
    { k: 'L2', label: 'Quantity', ok: L2 }, { k: 'L3', label: 'Program', ok: L3 },
  ];
  const statuses: St[] = [];
  { let broken = false; for (const b of base) { if (broken) statuses.push('SKIP'); else if (b.ok) statuses.push('PASS'); else { statuses.push('FAIL'); broken = true; } } }
  const ladder = base.map((b, i) => ({ ...b, st: statuses[i] }));
  const allPass = statuses.every((s) => s === 'PASS');
  const L2reached = L0 && L05 && L1;   // Quantity を見てよい
  const L3reached = L2reached && L2;   // Program を見てよい

  // Baseline（標準器・IMMUTABLE）：ALL PASS を固定。編集/修正/削除不可、改善は新版(v1.1/v2.0)を積む。
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [baselineVer, setBaselineVer] = useState<string>('Human Baseline v1.0');
  const baselineForCase = baseline && baseline.caseId === caseId ? baseline : null;

  // Run 記録（失敗も成果）。Compared Against（基準の version）と Decision を Run 自身に埋め込む＝後年も基準・判断が失われない。
  const [runs, setRuns] = useState<AcceptanceRun[]>([]);
  const [note, setNote] = useState<string>('');
  const [decision, setDecision] = useState<Decision | ''>('');
  const recordRun = () => {
    if (!report) return;
    const run: AcceptanceRun = {
      n: runs.length + 1, at: new Date().toISOString(), caseId, statuses, note,
      comparedAgainst: baselineForCase ? baselineForCase.version : null,
      decision: decision || null,
      l2: report.l2, l3: report.l3, breakdown,
    };
    setRuns((rs) => [...rs, run]); setNote(''); setDecision('');
  };
  const exportRuns = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(runs, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `iraka-acceptance-runs-${caseId}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  // IMMUTABLE：同一 version での上書き固定は不可（改善版は version を上げる）。
  const canLock = allPass && (!baselineForCase || baselineForCase.version !== (baselineVer || 'Human Baseline v1.0'));
  const lockBaseline = () => {
    if (!canLock) return;
    setBaseline({
      version: baselineVer || 'Human Baseline v1.0', caseId, provider: 'human', at: new Date().toISOString(), status: 'IMMUTABLE',
      quantities: quantities.map((x) => ({ key: x.key, label: x.label, unit: x.unit, value: round3(x.value) })), breakdown,
    });
  };
  const exportBaseline = () => {
    if (!baseline) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(baseline, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `iraka-baseline-${baseline.caseId}-${baseline.version.replace(/[^\w.]+/g, '_')}.json`; a.click(); URL.revokeObjectURL(url);
  };
  const importBaseline = (file: File) => { file.text().then((t) => { try { setBaseline(JSON.parse(t) as Baseline); } catch { /* 無視 */ } }); };
  const baselineDiff = baselineForCase
    ? quantities.map((cur) => { const bl = baselineForCase.quantities.find((b) => b.key === cur.key); return { key: cur.key, label: cur.label, base: bl ? bl.value : null, current: round3(cur.value), delta: bl ? round3(cur.value - bl.value) : null }; })
    : null;

  const exportCSV = () => {
    const csv = breakdownToCSV(breakdown);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `iraka-breakdown-${caseId}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // 自動提案(AI積算 v0)：屋根 Geometry から雨樋を提案し、手拾い・GT と並べる。採用で Model へ反映。
  const [ai, setAi] = useState<{ q: QuantityResult[]; drain: DrainModel; note: string } | null>(null);
  const computeAi = () => { const p = autoProposeGutter(roofModel); setAi({ q: drainQuantities(roofModel, p.model, scale), drain: p.model, note: p.note }); };
  const gtByKey = useMemo(() => { const m = new Map<string, number>(); if (caseWork) for (const it of caseWork.items) { const k = classifyGutterItem(it.name); if (k && !m.has(k)) m.set(k, it.qty); } return m; }, [caseWork]);
  const gKeys: Array<{ k: string; label: string; unit: string }> = [
    { k: 'gutterLength', label: '軒樋長', unit: 'm' }, { k: 'outletCount', label: '集水器数', unit: 'ヶ所' }, { k: 'downspoutLength', label: '縦樋長', unit: 'm' },
  ];
  const manualBy = (k: string) => quantities.find((q) => q.key === k)?.value;
  const aiBy = (k: string) => ai?.q.find((q) => q.key === k)?.value;

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

      {/* Overall ラダー（前段FAILで後段SKIP＝見る順番を固定） */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {ladder.map((x) => (
          <div key={x.k} style={{ flex: 1, textAlign: 'center', border: `1px solid ${stColor(x.st)}`, borderRadius: 6, padding: '4px 2px', background: stBg(x.st) }}>
            <div style={{ fontSize: 10, color: '#868e96' }}>{x.k}</div>
            <div style={{ fontSize: 9.5, color: '#495057' }}>{x.label}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: stColor(x.st) }}>{x.st}</div>
          </div>
        ))}
      </div>
      <div style={{ textAlign: 'center', fontWeight: 800, marginBottom: 8, color: allPass ? G : '#868e96' }}>
        {allPass ? '✅ L0〜L3 ALL PASS' : '実証中…（測定器：PASSより「なぜFAILか」を見る）'}
      </div>

      {/* Run 記録：失敗も成果として保存（基準version・Decisionを埋め込む） */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 3, background: '#f8f9fa', padding: 6, borderRadius: 6 }}>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason/メモ（例: E-014 role=eave should=keraba）"
          style={{ flex: 1, fontSize: 11, minWidth: 0 }} />
        <select value={decision} onChange={(e) => setDecision(e.target.value as Decision | '')} title="Decision：どう判断したか（4層目）" style={{ fontSize: 11 }}>
          <option value="">判断</option><option value="adopt">採用</option><option value="hold">保留</option><option value="reject">却下</option>
        </select>
        <button onClick={recordRun} title="Run として記録（基準versionも埋め込む）">記録</button>
        {runs.length > 0 && <button onClick={exportRuns} title="全RunをJSONで保存">保存({runs.length})</button>}
      </div>
      <div style={{ fontSize: 10, color: '#adb5bd', marginBottom: 6 }}>Compared Against: {baselineForCase ? baselineForCase.version : '未固定（Baseline無し）'}</div>
      {runs.length > 0 && (
        <div style={{ maxHeight: 90, overflowY: 'auto', marginBottom: 8, fontSize: 10.5 }}>
          {runs.slice().reverse().map((r) => (
            <div key={r.n} style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '1px 0', borderBottom: '1px solid #f1f3f5' }}>
              <span style={{ color: '#868e96', width: 34 }}>#{String(r.n).padStart(3, '0')}</span>
              <span style={{ width: 34, color: '#868e96' }}>{r.caseId.slice(0, 4)}</span>
              <span style={{ display: 'flex', gap: 2 }}>{r.statuses.map((s, i) => <span key={i} title={base[i].k} style={{ color: stColor(s), fontWeight: 700 }}>{s === 'PASS' ? '✓' : s === 'FAIL' ? '✗' : '–'}</span>)}</span>
              {r.decision && <span style={{ color: r.decision === 'adopt' ? G : r.decision === 'reject' ? R : '#f08c00', fontWeight: 700 }}>{decisionLabel[r.decision]}</span>}
              <span style={{ flex: 1, color: '#495057', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={(r.comparedAgainst ? 'vs ' + r.comparedAgainst : '基準なし') + (r.note ? ' — ' + r.note : '')}>{r.note}</span>
            </div>
          ))}
        </div>
      )}

      {/* Baseline（標準器・IMMUTABLE）：ALL PASSを固定→不変基準と比較。改善は上書きでなく新版(v1.1/v2.0)。Phase A 成果物＝Human Baseline v1.0 */}
      <div style={{ background: '#f3f0ff', padding: 6, borderRadius: 6, marginBottom: 8 }}>
        {baselineForCase && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontWeight: 700, color: '#5f3dc4' }}>🔒 {baselineForCase.version}</span>
            <span style={{ fontSize: 10, color: '#868e96' }}>{baselineForCase.provider} / IMMUTABLE</span>
            <span style={{ flex: 1 }} />
            <button onClick={exportBaseline} title="標準器をJSON保存（永続・不変）">保存</button>
            <button onClick={() => setBaseline(null)} title="表示から外す（切替用。保存済JSONは削除されない）">外す</button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontWeight: 700, color: '#5f3dc4', fontSize: 11 }}>Baseline</span>
          <input value={baselineVer} onChange={(e) => setBaselineVer(e.target.value)} style={{ flex: 1, fontSize: 11, minWidth: 0 }} />
          <button onClick={lockBaseline} disabled={!canLock}
            title={!allPass ? 'ALL PASS 後に固定できます' : (baselineForCase && baselineForCase.version === baselineVer ? '同一versionは上書き不可。改善版は v1.1 等に' : 'この合格結果を標準器として固定（IMMUTABLE）')}>固定</button>
          <label style={{ fontSize: 11, cursor: 'pointer', color: '#5f3dc4' }}>読込<input type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importBaseline(f); e.target.value = ''; }} /></label>
        </div>
        {baselineDiff && (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
            <thead><tr><th style={th}>項目</th><th style={{ ...th, textAlign: 'right' }}>Baseline</th><th style={{ ...th, textAlign: 'right' }}>Current</th><th style={{ ...th, textAlign: 'right' }}>Δ</th></tr></thead>
            <tbody>{baselineDiff.map((d) => (
              <tr key={d.key}>
                <td style={td}>{d.label}</td>
                <td style={num}>{d.base ?? '—'}</td>
                <td style={num}>{d.current}</td>
                <td style={{ ...num, color: d.delta === 0 ? G : d.delta == null ? GRAY : R }}>{d.delta == null ? '—' : d.delta}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
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

      {/* Quantity（L2）：L1まで通っていなければ SKIP（見る順番の固定） */}
      <div style={{ fontWeight: 700, color: '#343a40', margin: '10px 0 2px' }}>Quantity（L2：max(0.1m,1%) / 個数完全一致）</div>
      {!L2reached ? (
        <div style={{ padding: '6px 8px', background: '#f8f9fa', borderRadius: 6, color: '#868e96' }}>SKIP — 先に L0/L0.5/L1 を通す（前段が赤なら後段は見ない）</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>項目</th><th style={{ ...th, textAlign: 'right' }}>Engine</th><th style={{ ...th, textAlign: 'right' }}>GT</th><th style={{ ...th, textAlign: 'right' }}>Δ</th><th style={th}>判定</th></tr></thead>
          <tbody>{report ? report.l2.map(dRow) : <tr><td style={td} colSpan={5}>Case未選択</td></tr>}</tbody>
        </table>
      )}

      {/* Program（L3）：L2が通っていなければ SKIP */}
      <div style={{ fontWeight: 700, color: '#343a40', margin: '10px 0 2px' }}>Program（L3：見積・完全一致）<span style={{ color: '#868e96', fontWeight: 400 }}> WITH DOM</span></div>
      {!L3reached ? (
        <div style={{ padding: '6px 8px', background: '#f8f9fa', borderRadius: 6, color: '#868e96' }}>SKIP — 先に L2(Quantity) を通す</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>項目</th><th style={{ ...th, textAlign: 'right' }}>Engine</th><th style={{ ...th, textAlign: 'right' }}>GT</th><th style={{ ...th, textAlign: 'right' }}>Δ</th><th style={th}>判定</th></tr></thead>
          <tbody>{report ? report.l3.map(dRow) : <tr><td style={td} colSpan={5}>Case未選択</td></tr>}</tbody>
        </table>
      )}

      {/* 自動提案（AI積算）：手拾い vs AI vs GT。採用でAI提案を雨樋Modelへ反映（以後手で補正）。 */}
      <div style={{ fontWeight: 700, color: '#343a40', margin: '10px 0 2px' }}>自動提案（AI積算）<span style={{ color: '#868e96', fontWeight: 400 }}> 手拾い vs AI vs GT</span></div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
        <button onClick={computeAi} title="屋根Geometryから雨樋を自動提案">AI提案を計算</button>
        {ai && <button onClick={() => onAdoptDrain(ai.drain)} title="AI提案を雨樋Modelに採用（手拾いに反映・以後編集可）">AIを採用</button>}
        {ai && <span style={{ fontSize: 10, color: '#868e96', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ai.note}</span>}
      </div>
      {ai && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>項目</th><th style={{ ...th, textAlign: 'right' }}>手拾い</th><th style={{ ...th, textAlign: 'right' }}>AI提案</th><th style={{ ...th, textAlign: 'right' }}>GT</th></tr></thead>
          <tbody>{gKeys.map((g) => {
            const m = manualBy(g.k); const a = aiBy(g.k); const gt = gtByKey.get(g.k);
            const aiHit = a != null && gt != null && (g.unit === 'ヶ所' ? a === gt : Math.abs(a - gt) <= Math.max(0.1, 0.01 * gt));
            return (
              <tr key={g.k}>
                <td style={td}>{g.label}</td>
                <td style={num}>{m == null ? '—' : round3(m)}</td>
                <td style={{ ...num, color: a == null ? GRAY : aiHit ? G : R }}>{a == null ? '—' : round3(a)}</td>
                <td style={num}>{gt == null ? '—' : gt}</td>
              </tr>
            );
          })}</tbody>
        </table>
      )}

      <div style={{ marginTop: 8, fontSize: 10.5, color: '#868e96', lineHeight: 1.6 }}>
        Δが緑になるまで「較正 → 軒樋/縦樋/集水器をトレース（or AI提案を採用して補正）」。判定セルにカーソルで threshold/allowed/actual。
        手拾い(Human)とAI提案は同じ測定系で比較され、採用は Run の Decision に残せます。
      </div>
    </div>
  );
}
