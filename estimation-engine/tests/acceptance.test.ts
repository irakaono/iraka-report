// Drawing Intelligence Acceptance ハーネスのテスト。
//   実際に出荷する knowledge/programs/withdom-saitama.gutter.json と knowledge/validation/cases.json（水上）に対して、
//   「正しい Quantity なら L2/L3 全 PASS」「トレランス（max(0.1m,1%)・個数完全一致・見積完全一致）」「内訳ログの source/confidence」を検証。
import { readFileSync } from 'fs';
import {
  runAcceptance, buildBreakdown, judgeQuantity, classifyGutterItem, formatReport,
} from '../src/geometry/acceptance';
import type { GutterProgram, CaseWork } from '../src/geometry/acceptance';
import type { QuantityResult } from '../src/geometry/roofModel';

let n = 0;
const ok = (cond: boolean, msg: string) => { if (!cond) { throw new Error('FAIL: ' + msg); } n++; };

// 出荷ファイルを読む（cwd = estimation-engine）。
const program = JSON.parse(readFileSync('knowledge/programs/withdom-saitama.gutter.json', 'utf8')) as GutterProgram;
const cases = JSON.parse(readFileSync('knowledge/validation/cases.json', 'utf8')) as { cases: Array<{ id: string; gutter: CaseWork }> };
const mizukami = cases.cases.find((c) => c.id === 'mizukami')!;
const caseWork = mizukami.gutter;
const overhead = caseWork.items.find((it) => it.name === '諸経費')!.amount; // 10000

const q = (key: string, label: string, unit: string, value: number, ev: QuantityResult['evidence']): QuantityResult => ({ key, label, value, unit, evidence: ev });

// 「完全なトレース」で得られるはずの水上の Quantity（軒樋16.2 / 集水器4 / 竪樋23）。
const exact: QuantityResult[] = [
  q('gutterLength', '軒樋長', 'm', 16.2, [
    { kind: 'gutter_run', id: 'E-1', contribution: 6.0 },
    { kind: 'gutter_run', id: 'E-2', contribution: 6.0 },
    { kind: 'gutter_run', id: 'E-3', contribution: 4.2 },
  ]),
  q('outletCount', '集水器数', '個', 4, [
    { kind: 'drop', id: 'd1', contribution: 1 }, { kind: 'drop', id: 'd2', contribution: 1 },
    { kind: 'drop', id: 'd3', contribution: 1 }, { kind: 'drop', id: 'd4', contribution: 1 },
  ]),
  q('downspoutLength', '竪樋長', 'm', 23, [{ kind: 'segment', id: 's1', contribution: 23 }]),
];

// ── 1) 出荷 Program の単価が cases.json と一致 ──
ok(program.lines.find((l) => l.quantityKey === 'gutterLength')!.unitPrice === 3850, '軒とい単価3850');
ok(program.lines.find((l) => l.quantityKey === 'outletCount')!.unitPrice === 2950, '集水器単価2950');
ok(program.lines.find((l) => l.quantityKey === 'downspoutLength')!.unitPrice === 2200, 'たてとい単価2200');
ok(program.taxRate === 0.1, '税率10%');

// ── 2) 正しい Quantity → 全 PASS、見積が cases.json と完全一致 ──
const rep = runAcceptance({ caseId: 'mizukami', domain: 'gutter', quantities: exact, program, caseWork, overhead });
ok(rep.passed === true, '水上・完全トレースで ALL PASS');
ok(rep.estimate.total === caseWork.total, `total 一致 (${rep.estimate.total} === ${caseWork.total})`);
ok(rep.estimate.subtotal === caseWork.subtotal, `小計一致 (${rep.estimate.subtotal} === ${caseWork.subtotal})`);
ok(rep.estimate.tax === caseWork.tax, `税一致 (${rep.estimate.tax} === ${caseWork.tax})`);
ok(rep.estimate.lines.find((l) => l.quantityKey === 'gutterLength')!.amount === 62370, '軒とい金額62370');
ok(rep.estimate.lines.find((l) => l.quantityKey === 'downspoutLength')!.amount === 50600, 'たてとい金額50600');
ok(rep.l2.every((r) => r.verdict === 'PASS'), 'L2 全 PASS');
ok(rep.l3.every((r) => r.verdict === 'PASS'), 'L3 全 PASS');

// ── 3) トレランス：長さ max(0.1m,1%)、Ground Truth 粒度(0.1m)を下回らない ──
ok(judgeQuantity('gutterLength', '軒樋長', 'm', 16.18, 16.2).verdict === 'PASS', '16.18 は許容0.162内→PASS');
ok(judgeQuantity('gutterLength', '軒樋長', 'm', 16.18, 16.2).allowed === 0.162, '許容=max(0.1,1%)=0.162');
ok(judgeQuantity('gutterLength', '軒樋長', 'm', 16.0, 16.2).verdict === 'FAIL', '16.0 は0.2ずれ→FAIL');
// 短い辺：1%=0.02 より 0.1m を採る（原則：閾値は Ground Truth 粒度0.1mを超えない）
ok(judgeQuantity('x', 'x', 'm', 2.05, 2.0).allowed === 0.1, '短い辺の許容は0.1m（1%=0.02ではない）');
ok(judgeQuantity('x', 'x', 'm', 2.05, 2.0).verdict === 'PASS', '2.05 vs 2.0 は0.1内→PASS');

// ── 4) 個数は完全一致 ──
ok(judgeQuantity('outletCount', '集水器数', 'ヶ所', 4, 4).verdict === 'PASS', '集水器 4==4 PASS');
ok(judgeQuantity('outletCount', '集水器数', 'ヶ所', 3, 4).allowed === 0, '個数の許容は0');
ok(judgeQuantity('outletCount', '集水器数', 'ヶ所', 3, 4).verdict === 'FAIL', '集水器 3≠4 FAIL');

// ── 5) 内訳ログ：source/confidence（manual→将来 recognizer に差し替え・契約不変） ──
const bm = buildBreakdown(exact, 'manual', 1.0);
const g = bm.find((b) => b.key === 'gutterLength')!;
ok(g.rows.length === 3 && g.total === 16.2, '軒樋長は3辺・合計16.2');
ok(g.rows.every((r) => r.source === 'manual' && r.confidence === 1.0), 'manual/1.0');
ok(g.rows[0].refId === 'E-1' && g.rows[0].role === 'gutterLength', '内訳に edgeId/role');
const br = buildBreakdown(exact, 'recognizer', 0.94);
ok(br[0].rows[0].source === 'recognizer' && br[0].rows[0].confidence === 0.94, 'recognizer/0.94 に差し替え可');

// ── 6) role 分類：品名の表記ゆれ NF-1/NF-I に強い ──
ok(classifyGutterItem('軒とい ファインスケアNF-I型') === 'gutterLength', 'NF-I型→gutterLength');
ok(classifyGutterItem('軒とい ファインスケアNF-1型') === 'gutterLength', 'NF-1型→gutterLength');
ok(classifyGutterItem('集水器 F型') === 'outletCount', '集水器→outletCount');
ok(classifyGutterItem('たてとい') === 'downspoutLength', 'たてとい→downspoutLength');
ok(classifyGutterItem('諸経費') === null, '諸経費は数量対象外');

// ── 7) 誤った Quantity → FAIL が立ち、理由が残る ──
const wrong = exact.map((x) => x.key === 'gutterLength' ? { ...x, value: 15.0 } : x);
const rep2 = runAcceptance({ caseId: 'mizukami', domain: 'gutter', quantities: wrong, program, caseWork, overhead });
ok(rep2.passed === false, '軒樋15.0で全体FAIL');
const bad = rep2.l2.find((r) => r.key === 'gutterLength')!;
ok(bad.verdict === 'FAIL' && bad.actual === 1.2 && bad.allowed === 0.162, 'FAIL理由: actual1.2 > allowed0.162');

// 参考出力（人が読む形）
console.log(formatReport(rep));
console.log(`✅ Acceptance ハーネス test: 全 ${n} 件合格（内訳ログ source/confidence・トレランス max(0.1m,1%)・個数完全一致・見積完全一致・role分類）`);
