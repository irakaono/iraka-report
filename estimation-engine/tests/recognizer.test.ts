// Recognizer 自己テスト：Reader（立面グルーピング）と Reconciler（Observation統合→RoofConfiguration）。
import { readElevation, reconcileRoofConfig, DIR_JP, type RecoToken } from '../src/geometry/recognizer';

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
  // 屋根用語ラベル（東立面の近くに片棟・雨押え）
  t('片棟', 810, 460), t('雨押え', 815, 445),
  // ノイズ（遠い数値）
  t('7985', 400, 300),
];
const specs = readElevation(tokens);
const east = specs.find((s) => s.dir === 'east');
const west = specs.find((s) => s.dir === 'west');
ok(!!east && east.pitches.includes(2), `東立面→2寸（実 ${JSON.stringify(east)}）`);
ok(!!east && east.overhangs.includes(600), '東立面→軒の出600');
ok(!!west && west.pitches.includes(4), `西立面→4寸（実 ${JSON.stringify(west)}）`);
ok(!!west && west.overhangs.includes(250), '西立面→軒の出250');
ok(!east!.overhangs.includes(7985) && !west!.overhangs.includes(7985), '遠いノイズ(7985)は入らない');
ok(!!east && east.labels.includes('片棟') && east.labels.includes('雨押え'), `東立面ラベル→片棟/雨押え（実 ${JSON.stringify(east!.labels)}）`);
ok(!!west && !west.labels.includes('片棟'), '西立面には片棟ラベルが付かない（最寄り＝東）');

// 立面ラベルが無ければ空（グルーピング不能）
ok(readElevation([t('10', 0, 0), t('4', 8, 0)]).length === 0, 'ラベル無し→空');

// Reconciler：異なる勾配は異なる屋根面（東2寸+西4寸→面2つ）＋方位別 eave 辺（合成契約・ドラフト）
const cfg = reconcileRoofConfig({ elevations: specs });
ok(cfg.roofs.length === 2, `異勾配2種→屋根2面（実 ${cfg.roofs.length}）`);
ok(cfg.roofs.some((r) => r.slope === 2) && cfg.roofs.some((r) => r.slope === 4), 'slope 2寸/4寸 が RoofConfiguration に入る');
const e0 = cfg.roofs[0].edges || [];
ok(e0.some((e) => e.role === 'eave' && e.dir === 'east' && e.overhang === 600), `eave辺 east600（実 ${JSON.stringify(e0)}）`);
ok(e0.some((e) => e.role === 'eave' && e.dir === 'west' && e.overhang === 250), 'eave辺 west250');
// 面数の整合：Geometry（平面）の面数があれば優先
ok(reconcileRoofConfig({ elevations: specs, faceCount: 3 }).roofs.length === 3, 'faceCount優先→面3');
ok(reconcileRoofConfig({}).roofs.length === 1, '観測なし→屋根1（フォールバック）');

// ★屋根系統ごとに確定（Roof Unit）：主屋根(西4寸・つかみ込み) ＋ 東下屋(2寸・軒600・雨押え)。
const uc = reconcileRoofConfig({ elevations: specs, hierarchy: [
  { role: 'main', dir: 'west', name: '主屋根' },
  { role: 'lower', dir: 'east', name: '東下屋' },
] });
ok(uc.roofs.length === 2, `系統2つ→Unit2つ（実 ${uc.roofs.length}）`);
const uMain = uc.roofs[0], uLower = uc.roofs[1];
ok(uMain.role === 'main' && uMain.slope === 4, `主屋根＝西4寸（実 role=${uMain.role} slope=${uMain.slope}）`);
ok((uMain.edges || []).some((e) => e.role === 'grip'), '主屋根の水上＝つかみ込み（壁に当たらない片棟）');
ok(uLower.role === 'lower' && uLower.name === '東下屋' && uLower.slope === 2, `東下屋＝2寸（実 slope=${uLower.slope}）`);
ok((uLower.edges || []).some((e) => e.role === 'eave' && e.dir === 'east' && e.overhang === 600), '東下屋の軒＝east600');
ok((uLower.edges || []).some((e) => e.role === 'flashing'), '下屋の水上＝雨押え（壁有）');

// ★器（Roof Unit）へ Observation を集約：寄棟主屋根が四方の立面を1つの器に集める。
const hip = reconcileRoofConfig({ elevations: specs, hierarchy: [
  { role: 'main', facing: ['east', 'west', 'north', 'south'], name: '寄棟主屋根' },
] });
ok(hip.roofs.length === 1, '寄棟主屋根＝1系統（器は1つ）');
ok(hip.roofs[0].slope === 2, `四方を集約→代表勾配は最小2寸（実 ${hip.roofs[0].slope}）`);
const he = hip.roofs[0].edges || [];
ok(he.some((e) => e.role === 'eave' && e.dir === 'east' && e.overhang === 600)
  && he.some((e) => e.role === 'eave' && e.dir === 'west' && e.overhang === 250), '寄棟の軒＝東600・西250を器へ集約');
ok(!he.some((e) => e.role === 'grip' || e.role === 'flashing'), '多方向（寄棟）は水上納まりを付けない（頂部は棟＝Shape確定へ）');

if (fails.length) { console.error('❌ recognizer FAIL:\n' + fails.map((f) => '  - ' + f).join('\n')); process.exit(1); }
console.log(`✅ Recognizer(STEP2 立面グルーピング) test: 全 ${pass} 件合格（勾配三角・軒の出を方位へ割当）`);
