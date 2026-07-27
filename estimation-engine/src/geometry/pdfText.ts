// PDFテキストの前処理：1文字ずつ配置された図面（CAD書き出しに多い）を「語・数値」に結合する。
//   pdf.js の getTextContent は、図面によっては "9","1","0" のようにグリフを個別itemで返す。
//   そのままでは「910」「1/100」「縮尺」等が拾えないため、同一行・近接のグリフを1トークンに束ねる。
//   純関数（副作用なし）。scaleInference / elevationInference の入力を作るのに使う。

export interface RawGlyph { str: string; x: number; y: number; w?: number; fs?: number }
export interface Token { str: string; x: number; y: number }

// 同じ行(y近い)で、直前トークンの右端との隙間が小さいグリフを連結する。
export function coalesceTextItems(glyphs: RawGlyph[], opts: { yTol?: number; gapScale?: number; minGap?: number } = {}): Token[] {
  const yTol = opts.yTol ?? 3;
  const gapScale = opts.gapScale ?? 0.4;  // フォントサイズ×これ を語内ギャップ上限に
  const minGap = opts.minGap ?? 1.2;
  const its = glyphs
    .filter((g) => g && g.str != null && String(g.str).length > 0)
    .map((g) => ({ s: String(g.str), x: g.x, y: g.y, w: g.w ?? 0, fs: g.fs ?? 6 }));
  // 行にまとめる（yが近いもの）
  const rows: { y: number; items: typeof its }[] = [];
  for (const it of its.slice().sort((a, b) => b.y - a.y || a.x - b.x)) {
    let r = rows.find((rr) => Math.abs(rr.y - it.y) <= yTol);
    if (!r) { r = { y: it.y, items: [] }; rows.push(r); }
    r.items.push(it);
  }
  const tokens: Token[] = [];
  for (const r of rows) {
    r.items.sort((a, b) => a.x - b.x);
    let cur: { s: string; x: number; y: number; w: number; fs: number } | null = null;
    for (const it of r.items) {
      if (cur) {
        const gap = it.x - (cur.x + cur.w);
        if (gap <= Math.max(minGap, cur.fs * gapScale)) { cur.s += it.s; cur.w = (it.x + it.w) - cur.x; cur.fs = Math.max(cur.fs, it.fs); continue; }
        tokens.push({ str: cur.s.replace(/\s+/g, ''), x: cur.x, y: cur.y });
      }
      cur = { s: it.s, x: it.x, y: it.y, w: it.w, fs: it.fs };
    }
    if (cur) tokens.push({ str: cur.s.replace(/\s+/g, ''), x: cur.x, y: cur.y });
  }
  return tokens.filter((t) => t.str.length > 0);
}
