// 下書き生成（面数を実際の屋根に合わせる）の自己テスト。
//   ねらい：積算の根拠＝仮の下書き。片流れ2つなら2面、下屋があればその分だけ面を足す。
import { preset, shedFace, buildDraftFaces, suggestFaceCount } from '../src/geometry/draftFaces';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };

// preset：形テンプレの面数
ok(preset('shed').length === 1, '片流れ preset＝1面');
ok(preset('gable').length === 2, '切妻 preset＝2面');
ok(preset('hipped').length === 4, '方形 preset＝4面');

// shedFace：下端＝軒（eaveEdgeIndex=2）、4頂点の矩形
const sf = shedFace(100, 200, 4);
ok(sf.vertices.length === 4 && sf.eaveEdgeIndex === 2 && sf.pitch === 4, '下屋＝軒下端の4頂点矩形');

// 片流れ2つ：主屋根(片流れ・壁に当たらない片棟＝つかみ込み) ＋ 下屋1(壁有＝雨押え) ＝ 2面。
const d1 = buildDraftFaces('shed', 1, 4);
ok(d1.faces.length === 2, `片流れ＋下屋1＝2面（実 ${d1.faces.length}）`);
ok(JSON.stringify(d1.gripFaceIndices) === '[0]', `主屋根＝つかみ込み(軒仕様) index=[0]（実 ${JSON.stringify(d1.gripFaceIndices)}）`);
ok(JSON.stringify(d1.flashingFaceIndices) === '[1]', `下屋＝雨押え index=[1]（実 ${JSON.stringify(d1.flashingFaceIndices)}）`);
ok(d1.faces.every((f) => f.pitch === 4), '勾配は全面に反映');

// 追加なし片流れ：1面、水上＝つかみ込み（軒仕様）。雨押えは無し。
const d0 = buildDraftFaces('shed', 0, 5);
ok(d0.faces.length === 1 && JSON.stringify(d0.gripFaceIndices) === '[0]' && d0.flashingFaceIndices.length === 0, '片流れ単独＝1面・つかみ込み(index[0])・雨押えなし');

// 切妻＋下屋1：2(主)＋1(下屋)＝3面。つかみ込みは無し（主屋根が片流れでない）／下屋のみ雨押え(index=2)。
const g1 = buildDraftFaces('gable', 1, 5);
ok(g1.faces.length === 3, `切妻(2)＋下屋1＝3面（実 ${g1.faces.length}）`);
ok(g1.gripFaceIndices.length === 0 && JSON.stringify(g1.flashingFaceIndices) === '[2]', `切妻：つかみ込みなし・下屋雨押えindex=[2]（実 ${JSON.stringify(g1.flashingFaceIndices)}）`);

// 方形＋下屋2：4＋2＝6面。下屋2枚が雨押え(index=4,5)。下屋は主屋根(y<=400)の下に置かれる。
const h2 = buildDraftFaces('hipped', 2, 5);
ok(h2.faces.length === 6, `方形(4)＋下屋2＝6面（実 ${h2.faces.length}）`);
ok(h2.gripFaceIndices.length === 0 && JSON.stringify(h2.flashingFaceIndices) === '[4,5]', '方形：つかみ込みなし・下屋雨押えindex=[4,5]');
ok(h2.faces.slice(4).every((f) => Math.min(...f.vertices.map((v) => v.y)) >= 425), '下屋は主屋根の下（y>=425）に配置');

// 負数・端数はガード（extra<0 → 0面追加）
ok(buildDraftFaces('shed', -3, 5).faces.length === 1, '負の追加数は0扱い');

// suggestFaceCount：異なる勾配の数＝面数の証拠。片流れ2つ（東2寸・西4寸）→2。空→1。
ok(suggestFaceCount([[2], [4]]) === 2, '勾配2種→2面');
ok(suggestFaceCount([[4], [4]]) === 1, '同勾配→1面');
ok(suggestFaceCount([]) === 1, '読みなし→1面（フォールバック）');
ok(suggestFaceCount([[2, 4], []]) === 2, '1立面に2勾配→2面');

if (fails.length) { console.error('❌ draftFaces FAIL:\n' + fails.map((f) => '  - ' + f).join('\n')); process.exit(1); }
console.log(`✅ draftFaces test: 全 ${pass} 件合格（下書きの面数を実際の屋根に合わせる：片流れ2つ→2面・下屋→加算）`);
