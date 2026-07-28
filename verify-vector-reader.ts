// 甍AI Vector Reader 実図面検証ハーネス（node + pdfjs-dist・ローカル）。
//   目的：実 PDF を Vector Reader（PDF アダプタ）→ VecReading → compileTopology まで通し、
//         「入口（フォーマット依存）を差し替えても後段（フォーマット非依存）が効く」ことを実図面で確認する。
//   sandbox は pdf.js の CDN 動的 import が使えない → node の pdfjs-dist（legacy build）でベクター抽出する（既往手法）。
//
//   使い方：
//     npm run verify:reader -- <図面.pdf> [ページ番号]
//       ・ページ番号なし＝全ページを走査（どのページが平面図か＝ループが立つページを表示）。
//       ・ページ番号あり＝そのページの Topology IR（ループ・隣接）まで表示。
//
//   ★このハーネスは pdfjs I/O だけを担う。線分抽出のロジックは src/geometry/vectorReader.ts（純関数・テスト済み）。
//     ブラウザ側（DropLanding）も同じ純関数を使えるよう、pdfjs 呼び出しと変換ロジックは分離してある。

import { extractSegments, assembleVecReading, type PdfOps, type OperatorList } from '../src/geometry/vectorReader';
import { compileTopology } from '../src/geometry/topology';
import { coalesceTextItems, type RawGlyph } from '../src/geometry/pdfText';
import { readFileSync } from 'node:fs';

// pdfjs-dist は node_modules から実行時 import（esbuild --packages=external で外部化）。
const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');

function opsOf(OPS: any): PdfOps {
  return {
    save: OPS.save, restore: OPS.restore, transform: OPS.transform, constructPath: OPS.constructPath,
    moveTo: OPS.moveTo, lineTo: OPS.lineTo, curveTo: OPS.curveTo, curveTo2: OPS.curveTo2, curveTo3: OPS.curveTo3,
    closePath: OPS.closePath, rectangle: OPS.rectangle,
  };
}

async function pageGlyphs(page: any): Promise<RawGlyph[]> {
  const tc = await page.getTextContent();
  return (tc.items as any[])
    .filter((i) => i && typeof i.str === 'string' && Array.isArray(i.transform))
    .map((i) => ({ str: i.str as string, x: i.transform[4] as number, y: i.transform[5] as number, w: (i.width as number) || 0, fs: Math.hypot(i.transform[0], i.transform[1]) || 6 }));
}

async function run() {
  const pdfPath = process.argv[2];
  const onlyPage = process.argv[3] ? Number(process.argv[3]) : null;
  if (!pdfPath) { console.error('使い方: npm run verify:reader -- <図面.pdf> [ページ番号]'); process.exit(2); }

  const data = new Uint8Array(readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: false }).promise;
  const ops = opsOf(pdfjs.OPS);
  console.log(`\n📄 ${pdfPath} — ${doc.numPages} ページ\n`);

  const from = onlyPage ?? 1;
  const to = onlyPage ?? doc.numPages;
  for (let n = from; n <= to; n++) {
    const page = await doc.getPage(n);
    const opList = (await page.getOperatorList()) as OperatorList;
    const ex = extractSegments(opList, ops);
    const glyphs = await pageGlyphs(page);
    const texts = coalesceTextItems(glyphs);
    const reading = assembleVecReading(ex, texts);

    // 後段（フォーマット非依存）をそのまま通す。
    const geo = compileTopology(reading.segments);
    const axis = reading.segments.filter((s) => Math.abs(s.y1 - s.y2) < 1e-3 || Math.abs(s.x1 - s.x2) < 1e-3).length;

    const flag = geo.loops.length > 0 ? '  ← ループ検出' : '';
    console.log(
      `p${String(n).padStart(2)}  線分 ${String(reading.segments.length).padStart(5)}（軸平行 ${String(axis).padStart(5)}）` +
      ` 曲線 ${String(ex.stats.curves).padStart(4)} 矩形 ${String(ex.stats.rects).padStart(4)} 退化 ${String(ex.stats.dropped).padStart(4)}` +
      ` 文字 ${String(texts.length).padStart(4)}  → Topology: ループ ${geo.loops.length} 隣接 ${geo.adjacency.length} 内包 ${geo.containment.length}${flag}`,
    );

    if (onlyPage) {
      console.log(`\n  bbox: ${JSON.stringify(geo.bbox)}`);
      const scaleTok = texts.filter((t) => /^1\s*[\/／:]\s*\d{2,3}$/.test(t.str.replace(/\s/g, '')) || /縮尺/.test(t.str)).slice(0, 6).map((t) => t.str);
      if (scaleTok.length) console.log(`  縮尺らしき文字: ${JSON.stringify(scaleTok)}`);
      geo.loops.slice().sort((a, b) => b.area - a.area).slice(0, 8).forEach((l) => {
        const w = (l.rect.x1 - l.rect.x0).toFixed(1), h = (l.rect.y1 - l.rect.y0).toFixed(1);
        console.log(`  ${l.id}: 面積 ${l.area.toFixed(1)}  (${w} × ${h})  @(${l.rect.x0.toFixed(1)}, ${l.rect.y0.toFixed(1)})`);
      });
      if (geo.adjacency.length) console.log(`  隣接: ${JSON.stringify(geo.adjacency)}`);
    }
  }
  console.log('');
}

run().catch((e) => { console.error('検証失敗:', e); process.exit(1); });
