// 甍AI Estimation OS — ExportResult（Public Contract / 甍AI の ABI）e0.3.5③
// ★これは「書き出し形式」ではなく、Estimation OS が外部へ公開する唯一の契約。
//   Measurement → Geometry → SummaryResult → ExportResult ＝ Estimation OS の出口。
//   KKai / Excel / CSV / REST / SQLite … は全部この ExportResult を読む Adapter（e0.3.5④以降）。
//   契約(型)と組み立て純関数だけ。整形/書き出し（Adapter）はここに入れない。
//
// 版管理（2軸・LOCK）:
//   - exportContractVersion : 外部との「約束」の版。上がったら全 Adapter を更新（＝ABIの major）。
//   - schemaVersion         : ExportResult 自身の構造の版。約束が同じなら Adapter 据え置き可。
//
// 公開契約は内部モデル(Measurement)を晒さない: evidence は ExportEvidence DTO（vertices は載せない）。
//   vertices を知っていいのは Estimation OS だけ。KKai が vertices を要れば責務が逆流している。
import type { Measurement } from './types';
import { summarize, measurementQuantity } from './summary';
import type { SummaryResult } from './summary';

export const EXPORT_CONTRACT_VERSION = 1; // 外部との約束（ABIの版）
export const EXPORT_SCHEMA_VERSION = 1;   // ExportResult 自身の構造の版

// 公開契約に載せる「拾い単位の証拠」DTO。内部モデル Measurement とは切り離す。★vertices は持たない。
export interface ExportEvidence {
  measurementId: string;
  label: string;
  drawingId?: string;
  quantity: number; // 実量（Area は実面積。派生値）
  unit: string;
  pitch?: number;
}

export interface ExportResult {
  exportContractVersion: number;  // ★ABIの版。上がったら全 Adapter 更新
  schemaVersion: number;          // 構造の版（約束が同じなら Adapter 据え置き可）
  app: 'iraka-estimation-os';
  exportedAt: string;             // ISO（呼び出し側が渡す＝純関数を保つ）
  project: { name: string };
  summaries: SummaryResult[];     // 数量（根拠 measurementIds 付き）＝KKai の入力
  evidence: ExportEvidence[];     // 拾い単位の内訳（DTO・vertices なし）＝証拠を自己完結
}

// Measurement（内部モデル）→ ExportEvidence（公開DTO）。ここで内部と契約を切り離す。
function toExportEvidence(m: Measurement, scale: number): ExportEvidence {
  const q = measurementQuantity(m, scale);
  return {
    measurementId: q.measurementId,
    label: q.label,
    drawingId: q.drawingId,
    quantity: q.actual,
    unit: q.unit,
    pitch: q.pitch,
  };
}

/**
 * Estimation OS の Public Contract を生成する純関数。副作用なし。
 * JSON化・CSV化・ダウンロードは Adapter（e0.3.5④）の責務。
 */
export function buildExportResult(
  projectName: string,
  measurements: Measurement[],
  scale: number,
  exportedAt: string,
): ExportResult {
  return {
    exportContractVersion: EXPORT_CONTRACT_VERSION,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    app: 'iraka-estimation-os',
    exportedAt,
    project: { name: projectName || '無題の案件' },
    summaries: summarize(measurements, scale),
    evidence: measurements.map((m) => toExportEvidence(m, scale)),
  };
}
