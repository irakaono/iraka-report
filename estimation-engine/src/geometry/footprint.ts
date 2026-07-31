// 甍AI Footprint Placement（Confirmation 支援）— Recognizer が回収した Building Footprint Candidate を
//   Studio キャンバス座標へ「そのまま」写像する純関数。★背景（平面図）と同じ contain＋中央寄せ変換を使うので、
//   下書きが図面の建物にそのまま重なる（＝「PDFを開いたら実建物形状で下書きが出る」体験）。
//   ★純関数・UI/pdfjs 非依存。認識(vectorReader→wallFilter→traceOutline→cornerSnap)はブラウザ glue が回し、
//     その出力（画像ピクセル座標の polygon / corners と画像寸法）を本関数でキャンバスへ置くだけ。

import type { Pt } from './contourTrace';
import type { Point } from './roofModel';

// ブラウザ glue（DropLanding）が組み立てる認識結果。座標は「描画した平面図画像のピクセル」（背景と同座標系）。
export interface FootprintCandidate {
  polygon: Pt[];   // 建物外周候補（Building Footprint Candidate）。画像px・閉路（first≠last）。
  corners: Pt[];   // 認識した壁の角（吸着候補）。画像px。
  width: number;   // 描画した平面図画像の幅(px)
  height: number;  // 描画した平面図画像の高さ(px)
  page?: number;   // 由来ページ（任意）
}

// 画像(px) → キャンバス(px) の contain＋中央寄せ変換。★RoofStudio.fitImage と同一式（背景と重ねるため）。
export function fitTransform(imgW: number, imgH: number, canvasW: number, canvasH: number): { s: number; ox: number; oy: number } {
  const s = Math.min(canvasW / imgW, canvasH / imgH) || 1;
  return { s, ox: (canvasW - imgW * s) / 2, oy: (canvasH - imgH * s) / 2 };
}

// 画像px の polygon / corners を、平面図背景と同じ変換でキャンバス座標へ写像する。
export function placeFootprint(
  polygonImgPx: Pt[],
  cornersImgPx: Pt[],
  imgW: number,
  imgH: number,
  canvasW: number,
  canvasH: number,
): { vertices: Point[]; corners: Point[] } {
  const { s, ox, oy } = fitTransform(imgW, imgH, canvasW, canvasH);
  const map = (p: Pt): Point => ({ x: Math.round(p.x * s + ox), y: Math.round(p.y * s + oy) });
  return { vertices: polygonImgPx.map(map), corners: cornersImgPx.map(map) };
}
