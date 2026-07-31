// Vector Reader 自己テスト：pdfjs の operator list（生プリミティブ）→ VecSegment（絶対座標）。
//   ★pdfjs を import せず、実測した operator list の形（constructPath [ops, coords] ＋ transform/save/restore）を合成して検証。
//   検証観点：CTM 合成（transform/save/restore）／moveTo・lineTo・rectangle・closePath・curve／退化除去／VecReading 組み立て。
import { extractSegments, assembleVecReading, type OperatorList, type PdfOps } from '../src/geometry/vectorReader';
import { compileTopology } from '../src/geometry/topology';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, l: string) => { if (c) pass++; else fails.push(l); };

// 実 pdfjs.OPS の値に依存しないよう、テスト用に一意なコードを割り当てる（extractSegments はコードの中身を見ないため任意でよい）。
const OPS: PdfOps = {
  save: 1, restore: 2, transform: 3, constructPath: 4,
  moveTo: 10, lineTo: 11, curveTo: 12, curveTo2: 13, curveTo3: 14, closePath: 15, rectangle: 16,
};
// operator list を組み立てるヘルパ。
const list = (...rows: [number, any][]): OperatorList => ({ fnArray: rows.map((r) => r[0]), argsArray: rows.map((r) => r[1]) });
const path = (ops: number[], coords: number[], minMax: number[] = []) => [OPS.constructPath, [ops, coords, minMax]] as [number, any];
const has = (segs: any[], x1: number, y1: number, x2: number, y2: number) =>
  segs.some((s) => (Math.abs(s.x1 - x1) < 1e-6 && Math.abs(s.y1 - y1) < 1e-6 && Math.abs(s.x2 - x2) < 1e-6 && Math.abs(s.y2 - y2) < 1e-6)
                || (Math.abs(s.x1 - x2) < 1e-6 && Math.abs(s.y1 - y2) < 1e-6 && Math.abs(s.x2 - x1) < 1e-6 && Math.abs(s.y2 - y1) < 1e-6));

// ── 1. moveTo→lineTo→lineTo は連結した線分になる ──
{
  const { segments } = extractSegments(list(path([OPS.moveTo, OPS.lineTo, OPS.lineTo], [0, 0, 10, 0, 10, 5])), OPS);
  ok(segments.length === 2, `折れ線→2線分（実 ${segments.length}）`);
  ok(has(segments, 0, 0, 10, 0) && has(segments, 10, 0, 10, 5), '(0,0)-(10,0) と (10,0)-(10,5)');
}

// ── 2. rectangle オペは4辺の閉じた線分になる ──
{
  const { segments, stats } = extractSegments(list(path([OPS.rectangle], [2, 3, 4, 6])), OPS); // x,y,w,h
  ok(segments.length === 4 && stats.rects === 1, `rectangle→4辺（実 ${segments.length}）`);
  ok(has(segments, 2, 3, 6, 3) && has(segments, 6, 3, 6, 9) && has(segments, 6, 9, 2, 9) && has(segments, 2, 9, 2, 3), '矩形の4辺');
}

// ── 3. closePath は始点へ閉じる線分を足す ──
{
  const { segments } = extractSegments(list(path([OPS.moveTo, OPS.lineTo, OPS.lineTo, OPS.closePath], [0, 0, 10, 0, 10, 10])), OPS);
  ok(segments.length === 3 && has(segments, 10, 10, 0, 0), 'closePath で始点へ閉じる（3線分）');
}

// ── 4. transform（CTM）を畳んで絶対座標へ：translate(50,50) 下の (0,0)-(200,150) rect ──
{
  const { segments } = extractSegments(list(
    [OPS.transform, [1, 0, 0, 1, 50, 50]],
    path([OPS.rectangle], [0, 0, 200, 150]),
  ), OPS);
  ok(has(segments, 50, 50, 250, 50) && has(segments, 250, 200, 50, 200), 'CTM translate 適用で絶対座標(50,50)-(250,200)');
}

// ── 5. save/restore は CTM を巻き戻す（restore 後は変換が消える） ──
{
  const { segments } = extractSegments(list(
    [OPS.save, null],
    [OPS.transform, [2, 0, 0, 2, 0, 0]],   // scale x2
    path([OPS.moveTo, OPS.lineTo], [0, 0, 10, 0]),  // → (0,0)-(20,0)
    [OPS.restore, null],
    path([OPS.moveTo, OPS.lineTo], [0, 0, 10, 0]),  // → (0,0)-(10,0)（変換戻る）
  ), OPS);
  ok(has(segments, 0, 0, 20, 0), 'save下 scale×2 で (0,0)-(20,0)');
  ok(has(segments, 0, 0, 10, 0), 'restore後は等倍で (0,0)-(10,0)');
}

// ── 6. 曲線は既定で弦を引かない（端点は通過し、次の lineTo が正しく繋がる）＋ curves を数える ──
{
  const { segments, stats } = extractSegments(list(path([OPS.moveTo, OPS.curveTo, OPS.lineTo], [0, 0, 1, 1, 2, 2, 3, 3, 3, 10])), OPS);
  ok(stats.curves === 1, 'curve を1件計上');
  ok(segments.length === 1 && has(segments, 3, 3, 3, 10), '曲線は弦なし・端点(3,3)から次のlineTo(3,10)へ');
  // 'chord' 指定なら曲線を弦で線分化する
  const chord = extractSegments(list(path([OPS.moveTo, OPS.curveTo], [0, 0, 1, 1, 2, 2, 3, 3])), OPS, { includeCurves: 'chord' });
  ok(chord.segments.length === 1 && has(chord.segments, 0, 0, 3, 3), "includeCurves:'chord' で弦(0,0)-(3,3)");
}

// ── 7. 退化（長さ0）線分は捨て、件数を報告する（黙って消さない） ──
{
  const { segments, stats } = extractSegments(list(path([OPS.moveTo, OPS.lineTo, OPS.lineTo], [5, 5, 5, 5, 20, 5])), OPS);
  ok(segments.length === 1 && stats.dropped === 1, `退化1件を捨て報告（seg ${segments.length}/dropped ${stats.dropped}）`);
}

// ── 8. 空 operator list → 空・捏造しない ──
{
  const { segments } = extractSegments(list(), OPS);
  ok(segments.length === 0, '空→線分なし（捏造しない）');
}

// ── 9. assembleVecReading：線分＋文字＋北を VecReading にまとめる（texts 空なら省略） ──
{
  const ex = extractSegments(list(path([OPS.rectangle], [0, 0, 10, 10])), OPS);
  const r = assembleVecReading(ex, [{ str: '1/50', x: 3, y: 8 }], 7.5);
  ok(r.segments.length === 4 && r.texts?.[0].str === '1/50' && r.northDeg === 7.5, 'VecReading：線分4＋text＋northDeg');
  const r2 = assembleVecReading(ex);
  ok(r2.texts === undefined && r2.northDeg === undefined, 'texts/north 無指定なら省略');
}

// ── 10. 統合：Vector Reader → compileTopology で「主屋根＋東下屋」の2ループ・隣接1組を復元 ──
//   （topology.test.ts と同じ形を、rectangle オペ経由の生プリミティブから通す＝入口が変わっても後段が効く証明） ──
{
  const ex = extractSegments(list(
    path([OPS.rectangle], [0, 0, 100, 80]),      // 主屋根
    path([OPS.rectangle], [100, 20, 60, 50]),    // 東下屋（x=100 の壁で取り合う）
  ), OPS);
  const geo = compileTopology(ex.segments);
  ok(geo.loops.length === 2, `Reader→Topology で2ループ（実 ${geo.loops.length}）`);
  ok(geo.adjacency.length === 1, 'Reader→Topology で隣接1組（壁取り合い）');
  const areas = geo.loops.map((l) => l.area).sort((a, b) => b - a);
  ok(areas[0] === 8000 && areas[1] === 3000, `面積 主8000/下屋3000（実 ${areas.join('/')}）`);
}

if (fails.length) { console.error('❌ vectorReader FAIL:\n' + fails.map((f) => '  - ' + f).join('\n')); process.exit(1); }
console.log(`✅ vectorReader test: 全 ${pass} 件合格（CTM合成／move・line・rect・close・curve／退化除去／VecReading／Topology統合）`);
