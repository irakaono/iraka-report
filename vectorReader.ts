// 甍AI Vector Reader（PDF アダプタ）＝ Recognizer パイプラインの唯一の「フォーマット依存」入口。
//   役割：PDF/DWG/IFC/… の生プリミティブ → VecReading（線分・文字・北矢印の向き）。★推論しない。差し替えはここだけ。
//   その先（compileTopology → analyzePlan → reconcile）はフォーマット非依存で完成済み。
//   正の設計：claude/RECOGNIZER-ARCHITECTURE.md（§0 パイプライン／§1 Reader は「読む」だけで判断しない／§7 R-2b）。
//
//   ★純関数（副作用なし・pdfjs を import しない）。pdfText.ts と同じ思想：
//     pdfjs 依存の I/O（getOperatorList / getTextContent）はブラウザ側 glue と node 検証ハーネスが担い、
//     ここは「pdfjs が返した生データ → VecReading」の変換だけを担う（＝テスト可能・オフライン可）。
//
//   pdfjs の operator list（v4.x）の実体（実測・spike 済み）：
//     - パスは constructPath 1命令に束ねられる： args = [opsArray, coordsFlat, minMax]
//         opsArray … サブオペのコード列（moveTo/lineTo/curveTo/curveTo2/curveTo3/rectangle/closePath）
//         coordsFlat … 座標のフラット配列（moveTo/lineTo=2, curveTo=6, curveTo2/3=4, rectangle=4, closePath=0 を順に消費）
//     - 座標は「現在のユーザー空間（CTM 適用前）」＝ transform/save/restore を自前で畳んで絶対座標へ変換する必要がある。
//     - 塗り/線（fill/stroke）の別や色は幾何ではない → ここでは持たない（Reader は意味を付けない）。

import type { VecSegment, VecReading } from './topology';
import type { Token } from './pdfText';

// ── pdfjs の OPS（コード表）。pdfjs を import しないため、使うコードだけを受け取る（ブラウザ／node が pdfjs.OPS を渡す）。 ──
export interface PdfOps {
  save: number; restore: number; transform: number; constructPath: number;
  moveTo: number; lineTo: number; curveTo: number; curveTo2: number; curveTo3: number;
  closePath: number; rectangle: number;
}
// pdfjs の getOperatorList() の戻り値（必要な部分だけ）。
export interface OperatorList { fnArray: number[]; argsArray: any[] }

export interface ExtractOptions {
  minLen?: number;      // これ未満の長さの線分は退化（moveTo直後の点など）として捨てる。既定 1e-6。★意味付けではなく退化除去。
  includeCurves?: false | 'chord'; // 曲線の扱い：既定 false（弦を引かず端点だけ通過）。'chord' で始点→終点の弦を線分化。
}
export interface VectorExtract {
  segments: VecSegment[];
  stats: { paths: number; curves: number; rects: number; dropped: number }; // ★黙って捨てない：件数を必ず報告する。
}

type Mat = [number, number, number, number, number, number];
const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

// pdfjs Util.transform と同一（CTM の合成：ctm' = ctm × m）。
function mul(m1: Mat, m2: Mat): Mat {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}
// pdfjs Util.applyTransform と同一（点にCTMを適用して絶対座標へ）。
function apply(m: Mat, x: number, y: number): { x: number; y: number } {
  return { x: x * m[0] + y * m[2] + m[4], y: x * m[1] + y * m[3] + m[5] };
}

// ── Vector Reader 中核：operator list → 線分（絶対座標）。★屋根も方位も知らない。生プリミティブだけ。 ──
export function extractSegments(opList: OperatorList, ops: PdfOps, opt: ExtractOptions = {}): VectorExtract {
  const minLen = opt.minLen ?? 1e-6;
  const includeCurves = opt.includeCurves ?? false;
  const segs: VecSegment[] = [];
  const stats = { paths: 0, curves: 0, rects: 0, dropped: 0 };

  let ctm: Mat = IDENTITY;
  const stack: Mat[] = [];

  const push = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    if (Math.hypot(b.x - a.x, b.y - a.y) < minLen) { stats.dropped++; return; }
    segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  };

  const { fnArray, argsArray } = opList;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    if (fn === ops.save) { stack.push(ctm); continue; }
    if (fn === ops.restore) { ctm = stack.pop() ?? IDENTITY; continue; }
    if (fn === ops.transform) { const a = argsArray[i] as Mat; ctm = mul(ctm, a); continue; }
    if (fn !== ops.constructPath) continue;

    // constructPath: [opsArray, coordsFlat, minMax?]
    const sub: number[] = argsArray[i][0] || [];
    const co: number[] = argsArray[i][1] || [];
    let k = 0; // coordsFlat カーソル
    stats.paths++;
    let cur: { x: number; y: number } | null = null; // 現在点（絶対座標）
    let start: { x: number; y: number } | null = null; // サブパス始点（closePath 用）

    for (const s of sub) {
      if (s === ops.moveTo) {
        cur = apply(ctm, co[k], co[k + 1]); k += 2; start = cur;
      } else if (s === ops.lineTo) {
        const p = apply(ctm, co[k], co[k + 1]); k += 2;
        if (cur) push(cur, p);
        cur = p; if (!start) start = p;
      } else if (s === ops.curveTo) {
        const p = apply(ctm, co[k + 4], co[k + 5]); k += 6; stats.curves++;
        if (includeCurves === 'chord' && cur) push(cur, p);
        cur = p; if (!start) start = p;
      } else if (s === ops.curveTo2 || s === ops.curveTo3) {
        const p = apply(ctm, co[k + 2], co[k + 3]); k += 4; stats.curves++;
        if (includeCurves === 'chord' && cur) push(cur, p);
        cur = p; if (!start) start = p;
      } else if (s === ops.rectangle) {
        const x = co[k], y = co[k + 1], w = co[k + 2], h = co[k + 3]; k += 4; stats.rects++;
        const p0 = apply(ctm, x, y), p1 = apply(ctm, x + w, y), p2 = apply(ctm, x + w, y + h), p3 = apply(ctm, x, y + h);
        push(p0, p1); push(p1, p2); push(p2, p3); push(p3, p0);
        cur = p0; start = p0;
      } else if (s === ops.closePath) {
        if (cur && start) push(cur, start);
        cur = start;
      }
    }
  }
  return { segments: segs, stats };
}

// ── VecReading 組み立て：線分（Vector Reader）＋文字（pdfText の結合トークン）＋北矢印の向き（あれば素通し）。 ──
//   ★texts は既存の実績経路（getTextContent → coalesceTextItems）をそのまま採用（Reader は文字を解釈しない）。
//   ★northDeg は「描いてある向き」を素通しするだけ。矢印方向の推定は Analyzer の仕事なので Reader では付けない（未指定なら undefined）。
export function assembleVecReading(
  extract: VectorExtract,
  texts: Token[] = [],
  northDeg?: number,
): VecReading {
  const reading: VecReading = { segments: extract.segments };
  if (texts.length) reading.texts = texts.map((t) => ({ str: t.str, x: t.x, y: t.y }));
  if (typeof northDeg === 'number') reading.northDeg = northDeg;
  return reading;
}
