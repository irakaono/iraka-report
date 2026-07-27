// 縮尺の自動推論（AIは提案・人が確認＝原則14）。
//   2つの独立手法を持ち、互いにクロスチェックする：
//     ① 縮尺表記（縮尺 1/50 / S=1:100 …）  ＝図面テキストから直接
//     ② 寸法チェーン（910 1,820 …の連続寸法） ＝隣接寸法テキストの「中点間の画素距離」÷「実寸」から画素/m を実測
//   どちらも pxPerMeter（＝Calibration の意味）に落とすので、既存契約（calibration.ts）を壊さない。
//   ★重要：出力はあくまで「提案」。積算の土台なので、必ず人が確認して確定する（黙って適用しない）。

export interface ScaleTextItem { str: string; x: number; y: number } // x,y は PDFポイント座標（pdf.js transform[4],[5]）

export interface ScaleHint {
  pxPerMeter: number | null;          // 採用候補（note があれば note、無ければ dimension）
  source: 'note' | 'dimension' | 'note+dimension' | 'none';
  renderScale: number;                // PDFを画像化した倍率（pxPerMeter は画像px基準）
  noteD?: number;                     // 縮尺分母（1/D の D）
  noteCandidates?: number[];          // 複数縮尺が見つかった場合の候補（ambiguous 判定用）
  notePxPerMeter?: number;
  dimPxPerMeter?: number;
  dimSamples?: number;                // 寸法チェーンのサンプル数（多いほど信頼できる）
  agree?: boolean;                    // note と dimension が近い（±8%）か＝高信頼
}

const PT_PER_MM = 72 / 25.4; // 1mm あたりの PDFポイント（1pt=1/72inch, 1inch=25.4mm）

// 縮尺表記 1/D をテキストから全部拾う（縮尺 1/50 / S=1:100 / 1／50 など表記ゆれ対応）。
export function parseScaleNotes(strings: string[]): number[] {
  const out: number[] = [];
  const joined = strings.join('\n');
  // 「縮尺」「S=」の直後、または単独の 1/D（Dは1〜4桁）
  const re = /(?:縮尺|ｽｹｰﾙ|scale|S)\s*[=＝:：]?\s*1\s*[/／:：]\s*(\d{1,4})|(?<![\d.])1\s*[/／]\s*(\d{2,4})(?![\d.])/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(joined)) !== null) {
    const d = Number(m[1] ?? m[2]);
    if (d >= 5 && d <= 2000) out.push(d); // 建築図の常識的範囲（1/5〜1/2000）
  }
  return out;
}

const NUM_TOKEN = /^-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^-?\d+(?:\.\d+)?$/; // 910 / 1,137.5 / 9100 等の純数値
function parseDimMM(str: string): number | null {
  const s = str.trim();
  if (!NUM_TOKEN.test(s)) return null;                 // 純粋な数値トークンのみ（㎡・帖・CH等は除外）
  const v = Number(s.replace(/,/g, ''));
  if (!isFinite(v)) return null;
  if (v < 150 || v > 20000) return null;               // 建物内の寸法らしい範囲（mm）。面積/微小値/総寸を除外
  return v;
}

// 縮尺表記からの pxPerMeter（画像px基準）。
export function notePxPerMeter(D: number, renderScale: number): number {
  return (renderScale * PT_PER_MM * 1000) / D;
}

// 寸法チェーンから pxPerMeter を実測（画像px基準）。
//   考え方：連続寸法テキストは各スパンの「中点」に置かれる。隣接する2つの中点間の実距離＝(v_i+v_{i+1})/2。
//   その画素距離（＝ポイント距離×renderScale）を割れば px/mm→px/m が出る（スパン値そのものに依存しない）。
export function inferFromDimensionChain(
  items: ScaleTextItem[], renderScale: number,
  opts: { axisTol?: number; minGap?: number } = {},
): { pxPerMeter: number; samples: number } | null {
  const axisTol = opts.axisTol ?? 4;   // 同一直線とみなす直交方向の許容（pt）
  const nums = items
    .map((it) => ({ v: parseDimMM(it.str), x: it.x, y: it.y }))
    .filter((n): n is { v: number; x: number; y: number } => n.v != null);
  if (nums.length < 3) return null;

  const samples: number[] = [];
  const collectAlong = (axis: 'x' | 'y') => {
    const cross = axis === 'x' ? 'y' : 'x';
    // 直交座標が近いものを1本の寸法線としてまとめる
    const used = new Array(nums.length).fill(false);
    for (let i = 0; i < nums.length; i++) {
      if (used[i]) continue;
      const line = nums.filter((n) => Math.abs((n as any)[cross] - (nums[i] as any)[cross]) <= axisTol);
      if (line.length < 3) continue;
      line.forEach((n) => { const idx = nums.indexOf(n); if (idx >= 0) used[idx] = true; });
      line.sort((a, b) => (a as any)[axis] - (b as any)[axis]);
      for (let k = 0; k + 1 < line.length; k++) {
        const a = line[k]; const b = line[k + 1];
        const dPt = Math.abs((b as any)[axis] - (a as any)[axis]);
        if (dPt <= 1) continue;
        const dPx = dPt * renderScale;
        const realMM = (a.v + b.v) / 2;             // 中点間の実距離
        if (realMM <= 0) continue;
        const ppm = (dPx / realMM) * 1000;
        if (ppm > 1 && ppm < 100000) samples.push(ppm);
      }
    }
  };
  collectAlong('x'); // 横方向の寸法線
  collectAlong('y'); // 縦方向の寸法線
  if (samples.length < 2) return null;
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  return { pxPerMeter: median, samples: samples.length };
}

// 2手法を統合して1つの提案（ScaleHint）にする。noteを主・dimensionをクロスチェックに。
export function inferScale(items: ScaleTextItem[], renderScale: number): ScaleHint {
  const strings = items.map((i) => i.str);
  const notes = parseScaleNotes(strings);
  const uniqNotes = Array.from(new Set(notes));
  const dim = inferFromDimensionChain(items, renderScale);

  let noteD: number | undefined;
  if (uniqNotes.length > 0) {
    // 最頻値（同一シートで主縮尺が繰り返されやすい）。同数なら小さいD＝詳細寄りより大きい図を優先しない→最頻のみ。
    const freq = new Map<number, number>();
    notes.forEach((d) => freq.set(d, (freq.get(d) ?? 0) + 1));
    noteD = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  }
  const notePPM = noteD != null ? notePxPerMeter(noteD, renderScale) : undefined;
  const dimPPM = dim?.pxPerMeter;

  let agree: boolean | undefined;
  if (notePPM != null && dimPPM != null) {
    agree = Math.abs(notePPM - dimPPM) / notePPM <= 0.08;
  }

  let source: ScaleHint['source'] = 'none';
  let pxPerMeter: number | null = null;
  if (notePPM != null && dimPPM != null) { source = 'note+dimension'; pxPerMeter = notePPM; }
  else if (notePPM != null) { source = 'note'; pxPerMeter = notePPM; }
  else if (dimPPM != null) { source = 'dimension'; pxPerMeter = dimPPM; }

  return {
    pxPerMeter, source, renderScale,
    noteD, noteCandidates: uniqNotes.length > 1 ? uniqNotes.sort((a, b) => a - b) : undefined,
    notePxPerMeter: notePPM, dimPxPerMeter: dimPPM, dimSamples: dim?.samples, agree,
  };
}
