// 仮の下書き（下書き段階の Geometry）の生成器。
//   ★狙い：積算は「仮の下書き」を根拠にする。だから下書きの“面の数”が実際の屋根と合っているほど精度が上がる。
//     片流れが2つなら下書きも2面、2階/3階で下屋があればその分だけ面を足す（人が確認して調整＝確認ファースト）。
//   ★ここは純粋関数：座標系は Studio キャンバス（W720×H560）と同一。edgeRole 等の役割は付けない
//     （面の水上を雨押えにする等の“辺の割当”は Studio が RoofModel の辺IDへ後付けする）。
import type { Point } from './roofModel';

export interface DraftFace { vertices: Point[]; pitch: number; eaveEdgeIndex: number }

// 主屋根の形テンプレ（切妻=2面／方形=4面／片流れ=1面）。従来 RoofStudio.preset と同一座標。
export function preset(name: 'gable' | 'hipped' | 'shed'): DraftFace[] {
  if (name === 'gable') return [
    { vertices: [{ x: 150, y: 100 }, { x: 550, y: 100 }, { x: 550, y: 250 }, { x: 150, y: 250 }], pitch: 5, eaveEdgeIndex: 0 },
    { vertices: [{ x: 150, y: 250 }, { x: 550, y: 250 }, { x: 550, y: 400 }, { x: 150, y: 400 }], pitch: 5, eaveEdgeIndex: 2 },
  ];
  if (name === 'hipped') return [
    { vertices: [{ x: 150, y: 100 }, { x: 550, y: 100 }, { x: 350, y: 250 }], pitch: 5, eaveEdgeIndex: 0 },
    { vertices: [{ x: 550, y: 100 }, { x: 550, y: 400 }, { x: 350, y: 250 }], pitch: 5, eaveEdgeIndex: 0 },
    { vertices: [{ x: 550, y: 400 }, { x: 150, y: 400 }, { x: 350, y: 250 }], pitch: 5, eaveEdgeIndex: 0 },
    { vertices: [{ x: 150, y: 400 }, { x: 150, y: 100 }, { x: 350, y: 250 }], pitch: 5, eaveEdgeIndex: 0 },
  ];
  return [{ vertices: [{ x: 200, y: 150 }, { x: 520, y: 150 }, { x: 520, y: 380 }, { x: 200, y: 380 }], pitch: 5, eaveEdgeIndex: 0 }];
}

// 下屋（片流れ）1枚の矩形。下端(eaveEdgeIndex=2)＝軒、上端＝水上（壁取り合い＝雨押えの既定は Studio 側で辺へ付ける）。
const SHED_W = 150, SHED_H = 90;
export function shedFace(x: number, y: number, pitch: number): DraftFace {
  return { vertices: [{ x, y }, { x: x + SHED_W, y }, { x: x + SHED_W, y: y + SHED_H }, { x, y: y + SHED_H }], pitch, eaveEdgeIndex: 2 };
}

// 主屋根(form) ＋ 下屋(片流れ) extra 枚 の下書きを作る。
//   ★片流れ面の「水上（軒の対辺）」の既定は “壁に取り合うか” で分ける（WITHDOM Saitama＝片棟/軒 仕様）：
//     ・下屋（index base.. ）＝上階の壁に取り合う           → 水上は「雨押え」            → flashingFaceIndices
//     ・主屋根の片流れ（form==='shed' の index 0）＝壁に当たらない片棟 → 水上は「つかみ込み（軒仕様）」 → gripFaceIndices
//   Studio はこの index から RoofModel の水上辺IDを引いて roleOverride（つかみ込み/雨押え）を付ける。
export function buildDraftFaces(
  form: 'gable' | 'hipped' | 'shed',
  extra: number,
  pitch = 5,
): { faces: DraftFace[]; gripFaceIndices: number[]; flashingFaceIndices: number[] } {
  const n = Math.max(0, Math.floor(extra));
  const faces: DraftFace[] = preset(form).map((f) => ({ ...f, vertices: f.vertices.map((v) => ({ ...v })), pitch }));
  const base = faces.length;
  for (let i = 0; i < n; i++) {
    const col = i % 3, row = Math.floor(i / 3);
    faces.push(shedFace(165 + col * 180, 425 + row * 105, pitch)); // 主屋根の下に並べる（3枚で折返し）
  }
  const gripFaceIndices: number[] = form === 'shed' ? [0] : [];  // 壁に当たらない片棟＝つかみ込み（軒仕様）
  const flashingFaceIndices: number[] = [];                       // 下屋（壁有）＝雨押え
  for (let i = 0; i < n; i++) flashingFaceIndices.push(base + i);
  return { faces, gripFaceIndices, flashingFaceIndices };
}

// 立面の読み（勾配の異なり数）から下書きの“面数”を推定：異なる勾配は別の屋根面の証拠。最低1。
export function suggestFaceCount(pitchesPerElevation: number[][]): number {
  const distinct = new Set<number>();
  for (const ps of pitchesPerElevation) for (const p of ps) distinct.add(p);
  return Math.max(1, distinct.size || 1);
}
