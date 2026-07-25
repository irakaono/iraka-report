# e0.3 — Geometry Editor 起動方法

甍AI Estimation OS の Geometry Editor（PDF図面の上に Polygon を描き、面積を出して Measurement を保存する画面）。

## 起動

```bash
npm install
npm run dev
```

表示された URL（既定 http://localhost:5173）をブラウザで開く。

## 使い方（e0.3 完成条件）

1. 「図面を読み込む」で PDF または画像を背景に表示（無くても方眼で描ける）。
2. 「＋ 新規 Polygon」→ キャンバスを**左クリック**で頂点を追加。
3. 頂点を**ドラッグ**して移動 → 右パネルの面積(㎡)が**リアルタイム更新**。
4. 頂点を選んで **Delete** で削除。**右クリック**で Polygon 確定。
5. Label / Trade / Item を入れて「Measurement を保存」→ 一覧に追加（`vertices` だけ保存）。
6. 一覧の項目を**クリック**すると、その Polygon が強調表示。
7. 「measurements.json を書き出す」で保存内容を確認できる（真実は vertices のみ）。

## 縮尺

ツールバーの「縮尺(px/m)」で 1メートル=何ピクセルかを設定（既定 50）。
例: 50px/m のとき、5.0m × 3.7m の四角 = 18.5㎡。

## e0.3 では作らないもの

AI / Recognizer / Excel出力 / 見積書 / 単価 / Roof Engine — すべて後のタグで。

## 設計との対応

- `src/geometry/geometryEngine.ts` — Geometry Engine（Knowledge駆動。operation→calculator）
- `src/geometry/types.ts` — Measurement 型（vertices が真実、amount は持たない）
- `src/geometry/measurementStore.ts` — 保存（localStorage / JSON書き出し）
- `src/components/GeometryCanvas.tsx` — 描画・頂点編集
- `src/components/{Toolbar,Properties,MeasurementList}.tsx` — 操作・表示

> 進め方: まず動かし、使ってみて「これは Measurement に持たせるべきだった」と気付いたら DATAMODEL を直す。

---

## 中心思想（e0.3 で確定）— 画面 → Measurement

このエディタは **Geometry Editor ＝ CAD Core** である。
そして React の state は **Measurement そのもの**。画面が Measurement を直接編集する。

```
画面（頂点ドラッグ）
   ↓ 直接編集
Measurement { measurementId, geometry, operation, vertices, label, trade, item }
   ↑ 読むだけ            ↑ 書くだけ
Geometry Engine        Recognizer（将来）
Document Engine（将来）
```

- 編集中も1件の Measurement。新規は `measurementId` 空、保存で採番。
- 一覧の項目をクリックすると、その Measurement を読み込んで**頂点をそのまま再編集**できる。
- 面積は Geometry Engine が「編集中の Measurement」を読んで毎回計算（保存しない）。

## コミット / タグの刻み（推奨）

小さく刻んで、不具合が出ても戻しやすくする。

```
feat(editor): polygon editing     → tag e0.3-alpha1   （PDF/方眼 + Polygon描画）
feat(editor): measurement store   → tag e0.3-alpha2   （state=Measurement / 頂点編集）
feat(editor): realtime geometry   → （リアルタイム面積 … 本コミットに含む）
feat(editor): json export         → tag e0.3-alpha3   （Measurement保存 / JSON書き出し）
                                  → tag e0.3-geometry-editor （完成）
```

> 進め方: まず動かす → 使う → 「これは Measurement に持たせるべきだった」と気付いたら DATAMODEL を直す。

---

## e0.3 UX 操作（1棟を拾うための操作）

| 操作 | 効果 |
|------|------|
| 左クリック | 頂点を追加（スナップON時は既存頂点/直交へ吸着） |
| 頂点ドラッグ | 移動（ドラッグ中もスナップ） |
| 右クリック / 始点クリック | Polygon 確定（始点に近づくと自動閉じ） |
| Shift | 直交ロック（水平・垂直） |
| ホイール | ポインタ中心にズーム |
| Space+ドラッグ | パン |
| 縮尺較正 | 基準線の2点をクリック → 実長(mm)入力 → px/m を自動算出 |
| スナップ | ON/OFF 切替 |
| Ctrl+Z / 元に戻す | 直前の頂点操作を取り消す（Undo） |
| 全体表示 | ズーム/パンをリセット |

頂点・線・面積ラベルは画面上サイズが一定になるよう counter-scale。ズームしても掴みやすい。

## e0.3 完成条件（1棟を拾い切れる）

```
PDF読込 → 縮尺較正 → 屋根3面(A/B/下屋)をPolygonで拾う → Measurement保存 → measurements.json出力
```

ここまで通ったら `e0.3-geometry-editor` をタグ付け。
そこからは「実際の現場で使いながら育てる」フェーズに入る。
