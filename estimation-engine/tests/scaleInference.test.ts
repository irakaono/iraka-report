// 縮尺 自動推論 自己テスト。
//   ①縮尺表記の抽出 ②寸法チェーンからの pxPerMeter 実測 が、真値(1/50・renderScale2)を復元し、互いに一致することを固定。
import {
  parseScaleNotes, notePxPerMeter, inferFromDimensionChain, inferScale, type ScaleTextItem,
} from '../src/geometry/scaleInference';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };
const close = (a: number, b: number, t = 1e-3) => Math.abs(a - b) <= t;

// ── ① 縮尺表記の抽出（表記ゆれ） ──
ok(parseScaleNotes(['縮尺 1/50']).includes(50), '縮尺 1/50 → 50');
ok(parseScaleNotes(['S=1:100']).includes(100), 'S=1:100 → 100');
ok(parseScaleNotes(['1／30']).includes(30), '全角 1／30 → 30');
ok(parseScaleNotes(['縮尺 1/50', '詳細 1/20']).sort().join(',') === '20,50', '複数縮尺 → 候補列挙');
ok(parseScaleNotes(['面積 1/2 帖', 'x 1/3']).length === 0, '小さすぎるD(1/2,1/3)は縮尺として拾わない');

// ── notePxPerMeter（renderScale2・1/50）──
const truePPM = notePxPerMeter(50, 2); // = 2 * (72/25.4) * 1000 / 50
ok(close(truePPM, (2 * (72 / 25.4) * 1000) / 50), `notePxPerMeter(50,2)=${truePPM.toFixed(3)}`);

// ── ② 寸法チェーン：真値1/50で合成した連続寸法から pxPerMeter を実測 ──
const PT_PER_MM = 72 / 25.4;
const D = 50, renderScale = 2;
const ptPerRealMM = PT_PER_MM / D;                       // 実mm→PDFポイント
const withCommas = (v: number) => { const [i, f] = String(v).split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : ''); };

// 実図面(水上様邸1階)の横方向寸法列を再現：910 1,137.5 1,137.5 1,820 910 1,820
const spans = [910, 1137.5, 1137.5, 1820, 910, 1820];
const hItems: ScaleTextItem[] = [];
{
  let edge = 0;
  for (const s of spans) { const midMM = edge + s / 2; hItems.push({ str: withCommas(s), x: midMM * ptPerRealMM, y: 100 }); edge += s; }
}
const h = inferFromDimensionChain(hItems, renderScale);
ok(!!h && close(h!.pxPerMeter, truePPM, 0.5), `横寸法チェーン→pxPerMeter=${h?.pxPerMeter.toFixed(3)}（真値${truePPM.toFixed(3)}）`);
ok(!!h && h!.samples >= spans.length - 1, `サンプル数=${h?.samples}（>=${spans.length - 1}）`);

// 縦方向の寸法列（x一定・y変化）も実測できる
const vspans = [1820, 6370, 910];
const vItems: ScaleTextItem[] = [];
{
  let edge = 0;
  for (const s of vspans) { const midMM = edge + s / 2; vItems.push({ str: withCommas(s), x: 300, y: midMM * ptPerRealMM }); edge += s; }
}
const v = inferFromDimensionChain(vItems, renderScale);
ok(!!v && close(v!.pxPerMeter, truePPM, 0.5), `縦寸法チェーン→pxPerMeter=${v?.pxPerMeter.toFixed(3)}`);

// ノイズ（面積・単位付き）は無視される
const noisy = [...hItems, { str: '（4.14㎡）', x: 50, y: 100 }, { str: 'CH2,400', x: 60, y: 100 }, { str: '22.1帖', x: 70, y: 100 }];
const hn = inferFromDimensionChain(noisy, renderScale);
ok(!!hn && close(hn!.pxPerMeter, truePPM, 0.5), 'ノイズ混在でも実測値は不変（面積/CH/帖を除外）');

// ── 統合：note と dimension が一致（agree）し、pxPerMeter を採用 ──
const combined = inferScale([{ str: '縮尺 1/50', x: 0, y: 0 }, ...hItems, ...vItems], renderScale);
ok(combined.source === 'note+dimension', `source=note+dimension（実 ${combined.source}）`);
ok(combined.noteD === 50, `noteD=50（実 ${combined.noteD}）`);
ok(combined.agree === true, `note↔dimension 一致（agree=${combined.agree}）`);
ok(close(combined.pxPerMeter ?? -1, truePPM, 0.5), `採用pxPerMeter=${combined.pxPerMeter?.toFixed(3)}`);

// 表記なし・寸法のみ → dimension を採用
const dimOnly = inferScale(hItems, renderScale);
ok(dimOnly.source === 'dimension' && close(dimOnly.pxPerMeter ?? -1, truePPM, 0.5), '表記なし→dimensionを採用');

// 何も無い → none
ok(inferScale([{ str: 'あいうえお', x: 0, y: 0 }], renderScale).source === 'none', '手掛かり無し→none');

if (fails.length) { console.error('❌ scaleInference FAIL:\n' + fails.map((f) => '  - ' + f).join('\n')); process.exit(1); }
console.log(`✅ ScaleInference test: 全 ${pass} 件合格（縮尺表記抽出・寸法チェーン実測・note↔dimensionクロスチェック）`);
