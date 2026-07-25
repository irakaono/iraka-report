# 甍AI Estimation OS — 引き継ぎ（次チャット用 / e0.3.1）

## 現状
- `e0.1-constitution` ✅ 完了（理念・設計・規律を確定）
- `e0.2-datamodel` ✅ 完了（Data Model Complete。5モデル＋Geometry/Document Engine）
- `e0.3` CAD Core / Geometry Editor 実装完了。`e0.3-beta` が GitHub Pages で稼働確認済み。
- `e0.3.1` ✅ **公開版でクローズ**：UI日本語化＋読み込み時 fit。内部値（'Polygon'/'Area'/status等）は英語のまま＝データ互換維持。公開版で 起動・日本語表示・PDF読込・初期fit を確認済み。
- `e0.3.2` ✅ **実装済み（このチャット）**：案件エクスプローラー（左パネル・3カラム）／複数ファイル選択＋ドラッグ&ドロップ／複数ページPDFをページごと1図面に展開／図面リストのハイライト・「← 前の図面 / 次の図面 →」・切替時fit。
  - `types.ts` に `Drawing` / `Project`（`schemaVersion:1`）を新設。**Measurement 型は未変更**（drawingId/page は e0.3.3）。
  - ファイル入力は App が一元保持（Toolbr「図面を読み込む」/ Explorer「＋図面を追加」/ キャンバスDnD が同じ `loadFiles` を叩く）。図面背景は実行時のみ保持（永続化しない＝リロードで図面は消える。Measurement は従来どおり localStorage 永続）。
  - typecheck・build 両グリーン。画像2枚の取り込み・図面切替・切替時fitはヘッドレスで確認済み。複数ページPDF展開はコード確認のみ（この環境の headless から jsdelivr へ出られないため実PDF検証は公開版で行う）。
  - 既知の限定: この段階では保存済み拾いが全図面に重なって表示される（図面ごとの出し分けは drawingId が入る e0.3.4 から）。
- `e0.3.3` ✅ **保存基盤（このチャット）**：`projectStore.ts` 新設。
  - `.iraka.json` 案件ファイルの保存/読込（画像は dataURL 埋め込み＝自己完結・持ち運び可）。Explorer に「💾 案件を保存 / 📂 開く」。
  - IndexedDB（`iraka.db.v1`）に自動保存（800msデバウンス）＋起動時自動復元＋世代バックアップ（`backups` ストア・最大5・60秒間隔）。Explorer に「バックアップから復元」。
  - `Drawing` に `src`(dataURL) を追加＝図面画像の永続化の真実。`image` は src から生成する実行時オブジェクト。`SavedProject`/`SavedDrawing` 型を追加。
  - typecheck・build 両グリーン。保存→リロード→自動復元（図面・案件名・画像）をヘッドレスで確認済み。**Measurement 型は未変更**。
- `e0.3.4` ✅ **図面ひも付け（このチャット）＝型を触る唯一の版**：`Measurement` に `drawingId?`/`page?` 追加（任意＝既存互換）。
  - 保存時に「現在表示中の図面」へ自動ひも付け（旧データは更新時に補完）。拾いクリックで **その図面へジャンプ＋fit**（`selectMeasurement`）。
  - キャンバスは **現在図面の拾いだけ表示**（`others` を drawingId で filter。旧データ=drawingIdなしは常時表示）。一覧に所属図面名バッジ・別図面は薄く（`.list-item.other`）、Explorer に **図面ごとの拾い数**（`.dwg-count`）。
  - drawingId/page は `SavedProject` に自動で乗る（保存基盤に既に統合）。typecheck・build グリーン、seed復元で ひも付け/ジャンプ/フィルタ/カウント をヘッドレス確認。
- `e0.3.5-①` ✅ **自動計算・実面積（このチャット）**：`Measurement` に `pitch?`(勾配・寸)＝保存する唯一の値。Properties に勾配入力＋「平面積→実面積（×伸び率）」表示。`stretch.area`/`roof.actualArea` 接続。伸び率・実面積は派生・非保存。
- `e0.3.5-②` ✅ **集計 Result Envelope（このチャット）**：`summary.ts`（`summarize`/`measurementQuantity`）。工種×積算項目×単位で `SummaryResult{trade,item,quantity,unit,measurementIds}`。Summary パネルで合計→行展開で内訳→クリックで拾い/図面へジャンプ。**Summary も Evidence**。**保存は Measurement/pitch/drawingId のみ**（Summary/実面積/合計は保存しない＝毎回再生成）。
- `e0.3.5-③` ✅ **ExportResult Contract（このチャット）＝Estimation OS の Public Contract**：`src/geometry/exportResult.ts`。`ExportResult{schemaVersion,app,exportedAt,project,summaries,evidence}` 型＋`buildExportResult()` 純関数。**Adapter（書き出し）は入れない＝契約だけ**。app未接続なので見た目不変。
  - 責務境界を確定: **Estimation OS は数量（SummaryResult/ExportResult）まで。原価・見積は KKai**。ExportResult は「書き出し形式」ではなく外部公開の唯一の契約（Ports & Adapters）。KKai/Excel/CSV/REST は全部 ExportResult を読む Adapter。詳細 `NEXT-PLAN.md` / `IRAKA_ARCHITECTURE.md`。
  - 次は **e0.3.5-④ Export Adapters（JSON/CSV/Clipboard）**＝画面に「エクスポート」が出る。その後 e0.3.6 Excel Adapter。
  - ※ 版の刻みを更新: 図面ひも付け（drawingId/page）は **e0.3.4**、自動計算（勾配伸び率）は **e0.3.5**、Excel は **e0.3.6**（`NEXT-PLAN.md`）。
- **Geometry Knowledge ライブラリ（このチャット・app未接続）**：`src/geometry/` に `stretch.ts`（area/gable/hip/valley/ridge/eave）・`roof.ts`（actualArea/actualHipLength/actualValleyLength/actualGableLength/pitchHeight）・`convert.ts`（sunToRatio/sunToDegree/degreeToSun）・`index.ts` を追加。
  - 純関数のみ。**app からは未 import＝動作に影響なし**（tree-shake される）。e0.3.5 の自動計算で「掛けるだけ」で接続する。
  - 検算済み: area 4/5/10寸=1.077/1.118/1.414、hip=1.039/1.061/1.225、valley===hip、gable===area、actualArea(150,5寸)=167.7。式から算出（表を転記しない）。
  - 思想: **保存するのは pitch と平面量だけ、実量は毎回派生**（Evidence First）。将来 Wall/Foundation/Gutter/Flashing と増やし KCP・KKai・Estimation OS 共通の「屋根幾何知識」基盤にする。仕様は `claude/DESIGN-quantity-export.md`。

## デプロイ確定メモ（このチャットで解決）
- **公開先は `irakaono/iraka-estimation-os`**（URL: `https://irakaono.github.io/iraka-estimation-os/`）。Pages = ブランチからデプロイ / main / (根)。
- ⚠️ **`irakaono/iraka-report` は別アプリ（雨漏り調査報告書）**。稼働中の別物なので**触らない**（拾いエディタを上げると壊す）。長い間「上げても反映されない」と詰まったのは、操作対象を iraka-report と取り違えていたのが一因。
- 配信方式は **単一ファイル版**を採用（JS/CSS全部を1枚の index.html にインライン）。`src/` も Actions ビルドも不要でパス非依存。ビルド: `npx vite build --config vite.singlefile.config.ts` → `dist-single/index.html` を repo ルートに上書き。
- **PDF読込の落とし穴（重要）**: pdfjs の動的 import URL を**テンプレートリテラル（`${V}`）にすると single-file ビルドで壊れる**（`Unknown variable dynamic import: ./https:/cdn…` になり "図面の読み込みに失敗しました"）。**必ず固定の文字列リテラルで `import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.min.mjs')` と直書き**すること。修正済み。
  - pdfjs 本体は実行時に jsdelivr から読む（開発時に読めていた＝この環境の回線は jsdelivr 到達可）。もし将来ネットワークで CDN が塞がれるなら、pdfjs を `?worker&inline` で同梱する完全自己完結版に切り替える。

## バージョンの刻み（合意済み・切り戻しやすさ優先）
- **e0.3.1** UI改善（日本語化+fit・ロジック不変）… 実装済み・検証待ち
- **e0.3.2** 案件・図面管理（Project / Drawing・複数PDF/複数ページ/図面リスト/←→）… 次。Measurement型には触れない
- **e0.3.3** Measurement ↔ Drawing 連携（`drawingId`/`page` 追加 → 図面ジャンプ）… ここだけ型を触る＝独立ロールバック可
- **e0.4.0** Recognizer・Evidence Viewer・数量エンジン強化

## このOSの中心思想（絶対に崩さない）
- **真実は Measurement.vertices だけ**。amount / Quantity は保存しない（派生値）。
- **画面 → Measurement**：React state は Measurement そのもの（`editing: Measurement | null`）。
- **Geometry Engine は Measurement を読むだけ**（`measure(m)`）。拡張せず、計算能力は Geometry Knowledge（辞典）を増やす。
- **Quantity は派生ビュー**（保存しない。必要時のみ Cache＝実装であって真実ではない）。
- **Recognizer は PDF→Geometry だけ**書く（Decision/Measurement完成/Estimate/Documentは書かない）。
- **AI は横断レイヤー**。OSの中心ではない。器（CAD Core）が使えるのが先。
- 帳票 = データ＋Document＋Template（Excel/PDF/JSON はテンプレの一つ）。

## リポジトリ構成
```
iraka-estimation-os/
├ README.md           理念（数量を出すAIではない。判断を記録・理解・再利用するOS）
├ ARCHITECTURE.md     全体設計（Semantic Mapping は Future Work として記録のみ）
├ CONSTITUTION.md     原則1〜17（17: Knowledge はコードではない・資産）
├ DATAMODEL.md        設計の正（5モデル / Geometry Engine / Document Engine / 不変条件 / ロードマップ）
├ EDITOR.md           Geometry Editor 起動・操作・完成条件
├ BACKLOG-e0.4.md     e0.3-beta 検証記録表 と e0.4 候補
├ .gitignore          node_modules / __pycache__ など
├ proof/              e0.2 の証明（Python）
│  ├ sample_data.json    Decision/Measurement サンプル（quantities は持たない＝派生ビュー）
│  ├ template_engine.py  Geometry Engine + Quantity View + Document Engine（積算表.xlsx生成）
│  └ 積算表.xlsx         生成物（積算表/拾い明細/判断台帳の3シート）
└ （e0.3 CAD Core：Vite + React + TypeScript + Konva + pdfjs）
   ├ package.json / vite.config.ts / tsconfig*.json / index.html
   └ src/
      ├ main.tsx / index.css / vite-env.d.ts
      ├ App.tsx                     中心state=editing:Measurement。undo/history含む
      ├ components/
      │  ├ GeometryCanvas.tsx       Konva描画・頂点編集・snap・zoom/pan・自動閉じ・較正
      │  ├ Toolbar.tsx              図面読込/Polygon/確定/クリア/Undo/較正/スナップ/縮尺/全体表示
      │  ├ Properties.tsx           編集中Measurementの編集（label/trade/item・面積・status/rev）
      │  └ MeasurementList.tsx      一覧クリックで再編集・JSON書き出し
      └ geometry/
         ├ types.ts                Measurement型（vertices/status/revision …）
         ├ geometryEngine.ts       measure(m) → GEOMETRY_KNOWLEDGE(Area/Length/Count)へ委譲
         ├ measurementStore.ts     localStorage保存・採番・JSON書き出し・旧データ補完
         └ snap.ts                 既存頂点吸着・水平垂直スナップ
```

## e0.3 で実装済みの機能
Measurement中心 / World座標 / ズーム(ホイール)・パン(Space+ドラッグ) / スナップ(頂点・直交、Shift直交) /
Polygon自動閉じ(始点近接) / Undo(Ctrl+Z、1ドラッグ=1Undo) / 縮尺較正(2点+実長mm→px/m) /
面積リアルタイム(重心付近表示) / localStorage永続 / measurements.json 書き出し / status・revision。

## 起動
```bash
npm install
npm run dev   # http://localhost:5173
```
> Vite dev は esbuild で型を無視するので型エラーでも起動する。厳密な型チェックは `npm run build`（tsc）。

## 次チャットの最初のタスク
1. `e0.3-beta` タグを打つ（下記コマンド）。push前に `git status` を確認（node_modules/__pycache__ が入っていないこと）。
2. 本物の住宅屋根伏図(PDF)で **1棟拾い切る**検証：PDF読込 → 縮尺較正 → 屋根A/屋根B/下屋 を Polygon → 保存 → measurements.json。
3. `BACKLOG-e0.4.md` の記録表（所要時間/Polygon数/Undo/ズーム/パン/スナップ失敗/困ったこと）を3棟ぶん埋める。
4. 検証で詰まった点があればそれが e0.4 最優先。詰まらず通れば `e0.3-geometry-editor` へ昇格。

### タグ手順
```bash
cd <iraka-estimation-os のパス>
git add .
git status
git commit -m "feat(editor): CAD Core e0.3 — Measurement中心/snap/zoom-pan/縮尺較正/自動閉じ/Undo"
git push origin main
git tag -a e0.3-beta -m "CAD Core beta: 実図面で1棟拾いを検証する段階"
git push origin e0.3-beta
```

## ロードマップ（タグ）
```
e0.1-constitution ✅ → e0.2-datamodel ✅ → e0.3-beta（次）→ e0.3-geometry-editor（1棟拾えたら）
→ e0.4-geometry-engine（Edge Snap / Rectangle・Polyline・Point / Undo履歴可視化 / 複数選択）
→ e0.5-document-engine → e0.6-recognizer → e0.7-roof → e0.8-wall → e1.0-estimation-os
```
- e0.4 に入れる候補：Edge Snap、Undo履歴の可視化、Measurement複数選択、Rectangle/Polyline/Point ツール。
- e0.4 でまだ入れない：AI / Recognizer（CAD Core が十分に使えるのが先）。

## 既知の注意点
- PDF背景は pdfjs を遅延import（`pdfjs-dist/build/pdf.worker.min.mjs?url`）。読み込み失敗時は画像(PNG/JPG)でも可。
- 座標は world（Konva の getRelativePointerPosition / stage.scale・position）で統一。ズーム/パンしても vertices はぶれない。
- localStorage キー `iraka.measurements.v1`。旧データは status/revision を自動補完。
- 今のゴールは「OSを作る」ではなく **「実際の積算で毎日使いたくなる CAD を作る」**。

## GitHub Pages 配信メモ
- `vite.config.ts` に `base: '/iraka-estimation-os/'` を設定済み（Pages のサブパス配信用）。
- 手順: `npm run build` → `dist/` を Pages へ公開（gh-pages ブランチ or GitHub Actions）。
- リポジトリ名を変えたら `base` も合わせて変更する。ローカル `npm run dev` は base 有無に関わらず動作。

## GitHub Pages 自動デプロイ（真っ白の解消）
原因: Pages がビルド前のソース(main.tsx等)を配信していると真っ白になる。Vite は `dist/` を配信する必要がある。
解決: `.github/workflows/deploy.yml` で自動ビルド＆デプロイ。

手順（一度だけ）:
1. リポジトリに `.github/workflows/deploy.yml` を置く（同梱済み）。
2. GitHub → Settings → Pages → Build and deployment → **Source を「GitHub Actions」**に変更。
3. `git push`（またはWebで workflow ファイルをアップロード）すると Actions が走り、`npm install → npm run build(vite) → dist を Pages へ`。
4. Actions が緑✓になり 30秒〜1分で `https://<user>.github.io/iraka-estimation-os/` が表示される。

補足:
- `vite.config.ts` の `base: '/iraka-estimation-os/'` はリポジトリ名と一致必須。
- `npm run build` は `vite build` のみ（CIを確実に通すため）。型チェックは `npm run typecheck`。
- `proof/__pycache__` が既にコミット済みなら削除: `git rm -r --cached proof/__pycache__ && git commit -m "chore: drop __pycache__"`（今後は .gitignore で無視）。

### 切り分けメモ（重要・再発しやすい）
- **症状: 公開URLに README/ARCHITECTURE の Markdown が出る（アプリが出ない）** → Pages の **Source が「Deploy from a branch」**になっている。Jekyll がリポジトリの .md を配信し、`dist` のアプリは出ない。
  - 確認法: 公開URLの `/index.html` にも同じ Markdown が返り、`.js`/`.css` や `<div id="root">` が無ければこの症状。
  - 直し方: Settings → Pages → Source を **「GitHub Actions」** に戻す → Actions タブで「Deploy to GitHub Pages」を Run（または main へ push）→ 緑✓を確認。
  - deploy.yml / vite base は正しい前提（2026-07 時点で確認済み）。設定が branch に戻ると再発するので、まずここを疑う。
- Actions が赤✗（ビルド失敗）なら別問題。ログを確認（`npm install`/`vite build` のどこで落ちたか）。
- **症状: Actions は緑✓なのに設計書(Markdown)が出る／`/assets/` が404** → GitHub 上の**ファイルが正しく上がっていない**。過去に実際に起きた組み合わせ:
  - ルート `index.html` が Vite テンプレートでなく設計書HTML（「Rename index_flat.html to index.html」で上書きされた）。正しい index.html は12行・`<div id="root"></div>` と `<script type="module" src="/src/main.tsx">` を含む。
  - `src/` フォルダが GitHub に存在しない（`src/main.tsx` などが 404）。→ vite build がJSを生成せず dist は index.html だけ。
  - 確認法: `raw.githubusercontent.com/<user>/iraka-estimation-os/main/index.html` と `.../src/main.tsx` を直接開く。前者が設計書・後者が404ならこれ。
  - 直し方: ルート index.html を正しいテンプレに戻し、`src/` 一式をアップロード（= zip の中身で上書き）。以後 push で Actions が正常な dist を作る。
  - 教訓: GitHub の Web アップロードだと src/ の入れ忘れ・index.html の取り違えが起きやすい。**zip の中身をまるごと上書きアップロード**が確実。

## 次チャットの実装計画
- まず e0.3.1 の完了ゲート4項目（公開版＋実PDF）を確認 → e0.3.1 を正式クローズ。
- その後 `NEXT-PLAN.md` の版どおり:
  1. e0.3.1 UI日本語化＋fit … 実装済み（検証で閉じる）
  2. **← 次はここ**：e0.3.2 案件・図面管理（Project/Drawing・複数PDF/複数ページ・図面リスト・←→）※型は触らない
  3. e0.3.3 Measurement に `drawingId?`/`page?` 追加（拾いクリックで図面へジャンプ）※ここだけ型を触る
  4. e0.4.0 Recognizer / Evidence Viewer / 数量エンジン強化
- コンソールの「HTML dialog … user activation」警告は無害（window.prompt由来）。優先度低。
