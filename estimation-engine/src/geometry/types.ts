// 甍AI Estimation OS — Geometry / Measurement 型（DATAMODEL.md 準拠）
// 真実は vertices のみ。amount は保存しない（Geometry Engine が計算する）。

export type GeometryKind = 'Polygon' | 'Line' | 'Polyline' | 'Point';
export type Operation = 'Area' | 'Length' | 'Count';
export type Vertex = [number, number]; // 図面ピクセル座標

// ライフサイクル: editing → confirmed → locked
//   editing   : 編集中
//   confirmed : 積算対象として確定
//   locked    : 見積書/発注書の根拠になったため変更不可
export type MeasurementStatus = 'editing' | 'confirmed' | 'locked';

export interface Measurement {
  measurementId: string;
  geometry: GeometryKind;
  operation: Operation;
  vertices: Vertex[];   // ★唯一の保存値
  label: string;        // 例: 屋根面A
  trade: string;        // 例: 屋根工事（e0.3では仮入力でよい）
  item: string;         // 例: 横暖S 本体
  unit: string;         // ㎡ / m / 個
  status: MeasurementStatus; // 状態（AI生成/人修正/提出済みで扱いが違う）
  revision: number;     // 版。ドラッグで変わる geometry の履歴（Undo/比較の土台）
  drawingId?: string;   // 所属図面（e0.3.4）。任意＝既存互換。無い旧データは全図面で表示。
  page?: number;        // 所属図面のページ番号（任意）
  pitch?: number;       // 勾配（寸）e0.3.5。★保存するのはこれだけ。実面積・伸び率は派生（保存しない）。
}

// ── e0.3.2: 案件 = 図面一式 ────────────────────────────────────────────
// 「1案件 = 複数図面」を表す軽い概念。Measurement 型には触れない（ひも付けは e0.3.3）。

// 1枚の図面（PDFの1ページ or 画像1枚）。
// 永続化の真実は src(dataURL)。image は src から生成する実行時オブジェクト。
export interface Drawing {
  drawingId: string;   // 例: D-001
  name: string;        // 表示名 例: "A-06 屋根伏図 (p1)"
  sourceName: string;  // 元ファイル名 例: A-06.pdf
  page: number;        // 1始まりのページ番号（画像は常に 1）
  pageCount: number;   // 元ファイルの総ページ数
  src: string;         // 背景画像の dataURL（★永続化の真実）
  image: HTMLImageElement; // 実行時の描画用（src から生成。保存対象外）
}

// 案件。将来「エクスプローラー」に AI認識/手積算比較/Evidence を生やす器。
export interface Project {
  schemaVersion: number; // ★最初から持たせる。将来の移行処理の土台（現状 = 1）
  name: string;          // 案件名 例: 今野様邸
  createdAt?: string;    // ISO日時（任意）
  drawings: Drawing[];   // 図面一式
}

export const PROJECT_SCHEMA_VERSION = 1;

// ── 永続化用のシリアライズ形（image を持たず src のみ。JSON化できる） ──
export interface SavedDrawing {
  drawingId: string;
  name: string;
  sourceName: string;
  page: number;
  pageCount: number;
  src: string; // dataURL
}

// 案件ファイル(.iraka.json) / 自動保存 の中身。Measurement も同梱（vertices=真実）。
export interface SavedProject {
  schemaVersion: number;
  projectName: string;
  drawings: SavedDrawing[];
  measurements: Measurement[];
  settings?: { scale?: number }; // 縮尺など軽い設定
  metadata?: { savedAt?: string; app?: string };
}
