// 立面図 推論 自己テスト：勾配（三角/寸/スラッシュ）・軒の出・外側オフセットを固定。
import { pitchCandidates, overhangCandidates, inferElevation, offsetPolygonOutward, type ElevTextItem } from '../src/geometry/elevationInference';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };
const close = (a: number, b: number, t = 1e-6) => Math.abs(a - b) <= t;

// 勾配三角：「10」と隣接する rise を拾う（実図面 水上様邸：1.5寸・2寸）
const tri: ElevTextItem[] = [
  { str: '10', x: 100, y: 100 }, { str: '1.5', x: 122, y: 100 },
  { str: '10', x: 300, y: 200 }, { str: '2', x: 316, y: 205 },
  { str: '600', x: 100, y: 400 }, { str: '450', x: 140, y: 400 }, // ノイズ（軒の出寸法。三角ではない）
];
const pc = pitchCandidates(tri);
ok(pc.includes(1.5) && pc.includes(2), `勾配三角→1.5/2寸（実 ${JSON.stringify(pc)}）`);
ok(!pc.includes(600) && !pc.includes(450), '勾配に寸法(600/450)は混ざらない');

// 明示表記
ok(pitchCandidates([{ str: '5寸', x: 0, y: 0 }]).includes(5), 'N寸 → 5');
ok(pitchCandidates([{ str: '3/10', x: 0, y: 0 }]).includes(3), 'N/10 → 3');
ok(pitchCandidates([{ str: '10/4', x: 0, y: 0 }]).includes(4), '10/N → 4');

// 軒の出：軒先ラベル近傍の 450 を拾う（実図面は 450 が最頻）
const el: ElevTextItem[] = [
  { str: '軒先/樋先', x: 500, y: 500 }, { str: '450', x: 520, y: 500 },
  { str: '軒先', x: 700, y: 600 }, { str: '450', x: 715, y: 600 }, { str: '600', x: 760, y: 600 },
  { str: '7,985', x: 900, y: 100 }, // 最高高さ（遠い・除外）
];
const oc = overhangCandidates(el);
ok(oc.includes(450), `軒の出→450を含む（実 ${JSON.stringify(oc)}）`);
ok(!oc.includes(7985), '遠い寸法(最高高さ)は拾わない');

// inferElevation：最頻値
const hint = inferElevation([...tri, ...el]);
ok(hint.pitch === 1.5 || hint.pitch === 2, `pitch最頻=${hint.pitch}`);
ok(hint.overhang === 450, `overhang最頻=${hint.overhang}`);

// ── 外側オフセット：100×60矩形を10広げる → 各辺が10外へ ──
const rect = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }];
const off = offsetPolygonOutward(rect, 10);
ok(close(off[0].x, -10) && close(off[0].y, -10), `角0=(-10,-10)（実 ${off[0].x.toFixed(1)},${off[0].y.toFixed(1)}）`);
ok(close(off[1].x, 110) && close(off[1].y, -10), '角1=(110,-10)');
ok(close(off[2].x, 110) && close(off[2].y, 70), '角2=(110,70)');
ok(close(off[3].x, -10) && close(off[3].y, 70), '角3=(-10,70)');
// 面積が (100+20)*(60+20)=9600 に拡大
const a2 = (() => { let s = 0; for (let i = 0; i < off.length; i++) { const a = off[i], b = off[(i + 1) % off.length]; s += a.x * b.y - b.x * a.y; } return Math.abs(s) / 2; })();
ok(close(a2, 9600), `拡大後面積=9600（実 ${a2}）`);

if (fails.length) { console.error('❌ elevationInference FAIL:\n' + fails.map((f) => '  - ' + f).join('\n')); process.exit(1); }
console.log(`✅ ElevationInference test: 全 ${pass} 件合格（勾配三角/寸/スラッシュ・軒の出・外側オフセット）`);
