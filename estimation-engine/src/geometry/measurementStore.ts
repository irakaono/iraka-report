// 甍AI Estimation OS — Measurement ストア（e0.3 は localStorage の簡易版）
// Measurement（vertices）だけを保存する。amount / Quantity は保存しない。

import type { Measurement } from './types';

const KEY = 'iraka.measurements.v1';

export function loadMeasurements(): Measurement[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Measurement[];
    // 旧データに status / revision が無ければ補完（既存値があればそのまま）
    return arr.map((m) => ({
      ...m,
      status: m.status ?? ('editing' as const),
      revision: m.revision ?? 1,
    }));
  } catch {
    return [];
  }
}

export function persist(ms: Measurement[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ms));
  } catch {
    /* localStorage 不可でも動作は続行 */
  }
}

/** 既存の最大番号 + 1 で M-00x を採番（削除後の衝突を避ける）。 */
export function nextId(ms: Measurement[]): string {
  let max = 0;
  for (const m of ms) {
    const n = parseInt(m.measurementId.replace(/[^0-9]/g, ''), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return 'M-' + String(max + 1).padStart(3, '0');
}

/** measurements.json をダウンロード（vertices が真実であることの確認用）。 */
export function exportJSON(ms: Measurement[]): void {
  const blob = new Blob([JSON.stringify({ measurements: ms }, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'measurements.json';
  a.click();
  URL.revokeObjectURL(url);
}
