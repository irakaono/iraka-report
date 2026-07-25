// 見積書エクスポート（行組み立て）のテスト。出荷の WITH DOM Program で 雨樋が価格つき・屋根は数量のみ。
import { readFileSync } from 'fs';
import { buildEstimate, buildQuotation } from '../src/geometry/estimateExport';
import type { GutterProgram } from '../src/geometry/acceptance';
import type { QuantityResult } from '../src/geometry/roofModel';

let n = 0; const ok = (c: boolean, m: string) => { if (!c) throw new Error('FAIL: ' + m); n++; };
const program = JSON.parse(readFileSync('knowledge/programs/withdom-saitama.gutter.json', 'utf8')) as GutterProgram;
const q = (key: string, label: string, unit: string, value: number): QuantityResult => ({ key, label, value, unit, evidence: [] });

const roofQ = [q('roofArea', '実屋根面積', '㎡', 108.2), q('eaveLength', '軒先長', 'm', 16.2)];
const drainQ = [q('gutterLength', '軒樋長', 'm', 16.2), q('outletCount', '集水器数', 'ヶ所', 4), q('downspoutLength', '竪樋長', 'm', 23)];

const doc = buildEstimate(roofQ, drainQ, program, 10000);
const gutter = doc.rows.filter((r) => r.section === '雨樋');
const roof = doc.rows.filter((r) => r.section === '屋根');

ok(gutter.find((r) => /軒とい/.test(r.name))!.amount === 16.2 * 3850, '軒とい金額=16.2×3850');
ok(gutter.find((r) => /集水器/.test(r.name))!.amount === 4 * 2950, '集水器金額=4×2950');
ok(gutter.find((r) => /たてとい/.test(r.name))!.amount === 23 * 2200, 'たてとい金額=23×2200');
ok(gutter.find((r) => r.name === '諸経費')!.amount === 10000, '諸経費10000');
ok(doc.subtotal === 16.2 * 3850 + 4 * 2950 + 23 * 2200 + 10000, '小計=雨樋+諸経費');
ok(doc.tax === Math.round(doc.subtotal * 0.1), '消費税=round(小計×0.1)');
ok(doc.total === doc.subtotal + doc.tax, '合計=小計+税');
ok(roof.length === 2 && roof.every((r) => r.unitPrice === null && r.amount === null), '屋根は数量のみ（単価/金額なし）');

const quo = buildQuotation(doc, { customer: '水上 智紀', title: '雨樋工事', site: '東松山市', date: '2025-09-24' });
ok(quo.aoa[0][0] === '御　見　積　書', 'ヘッダ 御見積書');
ok(quo.aoa[10].join(',') === '品名,数量,単位,単価,金額,摘要', '見出し 品名/数量/単位/単価/金額/摘要');
ok(quo.aoa.some((r) => r[3] === '合　計' && r[4] === doc.total), '合計行あり');
ok(quo.aoa.some((r) => r[3] === '株式会社　甍'), '発行者 甍');
ok(quo.aoa.some((r) => String(r[0]).includes('水上 智紀') && String(r[0]).includes('様')), '宛先 様');
ok(quo.aoa.some((r) => String(r[0]).includes('税込合計金額')), '税込合計金額');
ok(quo.cols.length === 6 && quo.merges.length >= 2, '列幅6・タイトル結合');

console.log(`✅ EstimateExport test: 全 ${n} 件合格（雨樋WITH DOM価格・屋根数量のみ・見積書式AOA）`);
