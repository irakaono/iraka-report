// Recognizer STEP2（立面グルーピング）自己テスト。座標で 勾配三角・軒の出 を立面へ割り当てる。
import { recognizeElevationSpec, DIR_JP, type RecoToken } from '../src/geometry/recognizer';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };
const t = (str: string, x: number, y: number): RecoToken => ({ str, x, y });

ok(DIR_JP['南'] === 'south' && DIR_JP['東'] === 'east' && DIR_JP['北'] === 'north' && DIR_JP['西'] === 'west', '方位マップ');

// 2立面：東(800,470)に 2寸三角＋軒先600、西(800,100)に 4寸三角＋軒先250
const tokens: RecoToken[] = [
  t('東側立面図', 800, 470), t('西側立面図', 800, 100),
  // 東の勾配三角（10 と 2 が近接）＋軒先600
  t('10', 790, 455), t('2', 800, 450), t('軒先/樋先', 780, 450), t('600', 800, 448),
  // 西の勾配三角（10 と 4）＋軒先250
  t('10', 790, 120), t('4', 800, 115), t('軒先', 780, 118), t('250', 800, 116),
  // ノイズ（遠い数値）
  t('7985', 400, 300),
];
const specs = recognizeElevationSpec(tokens);
const east = specs.find((s) => s.dir === 'east');
const west = specs.find((s) => s.dir === 'west');
ok(!!east && east.pitches.includes(2), `東立面→2寸（実 ${JSON.stringify(east)}）`);
ok(!!east && east.overhangs.includes(600), '東立面→軒の出600');
ok(!!west && west.pitches.includes(4), `西立面→4寸（実 ${JSON.stringify(west)}）`);
ok(!!west && west.overhangs.includes(250), '西立面→軒の出250');
ok(!east!.overhangs.includes(7985) && !west!.overhangs.includes(7985), '遠いノイズ(7985)は入らない');

// 立面ラベルが無ければ空（グルーピング不能）
ok(recognizeElevationSpec([t('10', 0, 0), t('4', 8, 0)]).length === 0, 'ラベル無し→空');

if (fails.length) { console.error('❌ recognizer FAIL:\n' + fails.map((f) => '  - ' + f).join('\n')); process.exit(1); }
console.log(`✅ Recognizer(STEP2 立面グルーピング) test: 全 ${pass} 件合格（勾配三角・軒の出を方位へ割当）`);
