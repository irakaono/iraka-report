// 見積書エクスポート（行組み立て）のテスト。Roof/Gutter Domain Program で価格化・甍見積書式AOA。
import { readFileSync } from 'fs';
import { buildEstimate, buildQuotation } from '../src/geometry/estimateExport';
import type { GutterProgram } from '../src/geometry/acceptance';
import type { QuantityResult } from '../src/geometry/roofModel';

let n = 0; const ok = (c: boolean, m: string) => { if (!c) throw new Error('FAIL: ' + m); n++; };
const gutterProgram = JSON.parse(readFileSync('knowledge/programs/withdom-saitama.gutter.json', 'utf8')) as GutterProgram;
const roofProgram = JSON.parse(readFileSync('knowledge/programs/withdom-saitama.roof.json', 'utf8')) as GutterProgram;
const q = (key: string, label: string, unit: string, value: number): QuantityResult => ({ key, label, value, unit, evidence: [] });

// 水上相当：屋根面積108.2・軒16.2・ケラバ53.2、雨樋 軒樋16.2/集水器4/縦樋23。
const roofQ = [q('roofArea', '実屋根面積', '㎡', 108.2), q('eaveLength', '軒長', 'm', 16.2), q('gableLength', 'ケラバ長', 'm', 53.2)];
const drainQ = [q('gutterLength', '軒樋長', 'm', 16.2), q('outletCount', '集水器数', 'ヶ所', 4), q('downspoutLength', '竪樋長', 'm', 23)];

// ── 1) 雨樋のみ（roofProgram=null）：屋根は数量のみ ──
const g = buildEstimate(roofQ, drainQ, gutterProgram, null, 10000);
ok(g.rows.filter((r) => r.section === '屋根').every((r) => r.unitPrice === null), '雨樋のみ時は屋根 単価なし');
ok(g.rows.find((r) => /軒とい/.test(r.name))!.amount === 16.2 * 3850, '軒とい金額');
ok(g.rows.find((r) => r.name === '諸経費')!.amount === 10000, '諸経費10000');

// ── 2) 屋根＋雨樋（Roof Domain Program 適用）：屋根が価格つき ──
const doc = buildEstimate(roofQ, drainQ, gutterProgram, roofProgram, 10000);
const roof = doc.rows.filter((r) => r.section === '屋根');
const find = (re: RegExp) => roof.find((r) => re.test(r.name));
ok(find(/下葺ルーフィング/)!.amount === Math.round(108.2 * 1350), 'ルーフィング=108.2×1350');
ok(find(/デコルーフ/)!.amount === Math.round(108.2 * 4900), 'デコルーフ=108.2×4900');
ok(find(/桟鼻/)!.amount === Math.round(16.2 * 750), '桟鼻=軒16.2×750');
ok(find(/雪止め/)!.amount === Math.round(16.2 * 2400), '雪止め=軒16.2×2400');
ok(find(/捨て唐草45/)!.amount === Math.round(53.2 * 900), '唐草45=ケラバ53.2×900');
ok(find(/破風板金/)!.amount === Math.round(53.2 * 2800), '破風=ケラバ53.2×2800');
ok(!roof.some((r) => r.name === '棟'), '棟長0は出さない');
ok(roof.every((r) => r.unitPrice !== null), '屋根 全行に単価');
// 屋根主要6項目＋雨樋3＋諸経費 が小計に入る
const expectRoof = Math.round(108.2 * 1350) + Math.round(108.2 * 4900) + Math.round(16.2 * 750) + Math.round(16.2 * 2400) + Math.round(53.2 * 900) + Math.round(53.2 * 2800);
const expectGutter = 16.2 * 3850 + 4 * 2950 + 23 * 2200;
ok(doc.subtotal === expectRoof + expectGutter + 10000, `小計=屋根+雨樋+諸経費 (${doc.subtotal})`);
ok(doc.tax === Math.round(doc.subtotal * 0.1) && doc.total === doc.subtotal + doc.tax, '税・合計');

// ── 3) 甍 見積書書式 AOA ──
const quo = buildQuotation(doc, { customer: '水上 智紀', title: '屋根・雨樋工事', site: '東松山市', date: '2025-09-24' });
ok(quo.aoa[0][0] === '御　見　積　書', 'ヘッダ 御見積書');
ok(quo.aoa[10].join(',') === '品名,数量,単位,単価,金額,摘要', '見出し');
ok(quo.aoa.some((r) => r[3] === '株式会社　甍'), '発行者 甍');
ok(quo.aoa.some((r) => r[3] === '合　計' && r[4] === doc.total), '合計行');
ok(quo.cols.length === 6 && quo.merges.length >= 2, '列幅6・結合');

console.log(`✅ EstimateExport test: 全 ${n} 件合格（Roof/Gutter Domain Program 価格化・甍見積書式）`);
