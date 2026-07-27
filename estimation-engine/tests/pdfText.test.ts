// PDFグリフ結合 自己テスト：1文字ずつのitemを語・数値に束ねる。
import { coalesceTextItems, type RawGlyph } from '../src/geometry/pdfText';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };

// 幅6・フォント10のグリフを x=0,6,12… と隣接配置 → 連結。離れたら別トークン。
const g = (s: string, x: number, y: number): RawGlyph => ({ str: s, x, y, w: 6, fs: 10 });

// "9","1","0" 隣接 → "910"／同じ行の離れた "1","/","5","0" → "1/50"
const row1: RawGlyph[] = [
  g('9', 0, 100), g('1', 6, 100), g('0', 12, 100),
  g('1', 60, 100), g('/', 66, 100), g('5', 72, 100), g('0', 78, 100),
];
const t1 = coalesceTextItems(row1).map((t) => t.str);
ok(t1.includes('910'), `"9""1""0"→910（実 ${JSON.stringify(t1)}）`);
ok(t1.includes('1/50'), `"1""/""5""0"→1/50（実 ${JSON.stringify(t1)}）`);

// 別の行(yが離れる)は結合しない
const t2 = coalesceTextItems([g('縮', 0, 200), g('尺', 6, 200), g('7', 0, 100)]).map((t) => t.str);
ok(t2.includes('縮尺'), '縦は別行：縮尺が1語に');
ok(t2.includes('7'), '別行の7は独立');

// 大きな隙間は語境界（"軒先" と "450" が離れていれば別トークン）
const t3 = coalesceTextItems([g('軒', 0, 50), g('先', 6, 50), g('4', 200, 50), g('5', 206, 50), g('0', 212, 50)]).map((t) => t.str);
ok(t3.includes('軒先') && t3.includes('450'), `大きな隙間で分離（実 ${JSON.stringify(t3)}）`);

// 空要素は無視
ok(coalesceTextItems([{ str: '', x: 0, y: 0 } as RawGlyph, g('A', 0, 0)]).length === 1, '空グリフは無視');

if (fails.length) { console.error('❌ pdfText FAIL:\n' + fails.map((f) => '  - ' + f).join('\n')); process.exit(1); }
console.log(`✅ pdfText(coalesce) test: 全 ${pass} 件合格（グリフ→語/数値の結合・行分離・語境界）`);
