// 甍AI Estimation OS — Geometry Engine
// エンジンは Measurement（の operation, vertices）を読むだけ。
// 何を計算できるかは GEOMETRY_KNOWLEDGE が持つ（エンジンは拡張しない・Knowledgeを増やす）。
// （DATAMODEL 不変条件10）

import type { Measurement, Operation, Vertex } from './types';

/** Polygon 面積（シューレース公式）。ピクセル面積を返す。 */
export function polygonArea(v: Vertex[]): number {
  const n = v.length;
  if (n < 3) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = v[i];
    const [x2, y2] = v[(i + 1) % n];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

/** Polyline / Line 長さ（線分の総和）。 */
export function polylineLength(v: Vertex[]): number {
  let s = 0;
  for (let i = 0; i < v.length - 1; i++) {
    const [x1, y1] = v[i];
    const [x2, y2] = v[i + 1];
    s += Math.hypot(x2 - x1, y2 - y1);
  }
  return s;
}

/** Point 個数。 */
export function pointCount(v: Vertex[]): number {
  return v.length;
}

// 辞典: operation → calculator（将来ここに1行足すだけで拡張できる）
export const GEOMETRY_KNOWLEDGE: Record<Operation, (v: Vertex[]) => number> = {
  Area: polygonArea,
  Length: polylineLength,
  Count: pointCount,
};

/** 低レベル: operation と vertices から計算。 */
export function calculate(operation: Operation, vertices: Vertex[]): number {
  const fn = GEOMETRY_KNOWLEDGE[operation];
  if (!fn) throw new Error(`Geometry Knowledge に operation '${operation}' が無い`);
  return fn(vertices);
}

/** Geometry Engine 本体：Measurement を読むだけ（画面→Measurement→ここ）。 */
export function measure(m: Pick<Measurement, 'operation' | 'vertices'>): number {
  return calculate(m.operation, m.vertices);
}

/** ピクセル値 → ㎡（scale = 1mあたりのピクセル数）。表示用の較正。 */
export function toSquareMeters(pixelArea: number, pxPerMeter: number): number {
  if (pxPerMeter <= 0) return 0;
  return Math.round((pixelArea / (pxPerMeter * pxPerMeter)) * 100) / 100;
}
