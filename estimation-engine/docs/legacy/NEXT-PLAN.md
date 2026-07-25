# 計画（核を固める順：保存 → ひも付け → 自動計算 → Excel）

## 現状
- **公開先 `irakaono/iraka-estimation-os`（単一ファイル方式）で稼働**。URL: `https://irakaono.github.io/iraka-estimation-os/`。※ `iraka-report` は別アプリ（雨漏り調査報告書）なので触らない。
- ✅ **e0.3.1 公開クローズ**：日本語UI・PDF読込・初期fit。
- ✅ **e0.3.2 実装**：案件エクスプローラー（3カラム）／複数ファイル＋DnD／複数ページPDF展開／図面切替・fit。Project/Drawing 型。
- ✅ **e0.3.3 実装＝保存基盤**：`.iraka.json` 保存/読込／IndexedDB 自動保存＋起動復元／世代バックアップ。Drawing に `src`(dataURL)。
- ✅ **e0.3.4 実装（このチャット）＝図面ひも付け**：`Measurement` に `drawingId?`/`page?` を追加（任意＝既存互換）。保存時に現在図面へ自動ひも付け。拾いクリックで**その図面へジャンプ**。キャンバスは**現在図面の拾いだけ表示**（他図面は非表示、旧データは常時表示）。一覧に所属図面名バッジ・別図面は薄く表示、エクスプローラーに**図面ごとの拾い数**。typecheck・build グリーン、seed復元で ひも付け/ジャンプ/フィルタ/カウント をヘッドレス確認。
- ✅ **e0.3.5-① 実装（このチャット）＝自動計算・実面積**：`Measurement` に `pitch?`(勾配・寸) 追加＝**保存する唯一の値**。Properties に勾配入力＋「平面積 → 実面積（平面積×伸び率）」表示。Geometry Knowledge（`stretch.area`/`roof.actualArea`）を接続。伸び率・実面積は派生・非保存。検証: 平面4.00→勾配5寸→実面積4.47（×1.118）、勾配だけ永続、をヘッドレス確認。
- ✅ **e0.3.5-② 実装（このチャット）＝集計（Result Envelope）**：`summary.ts` 新設。工種×積算項目×単位で `SummaryResult{trade,item,quantity,unit,measurementIds}` を生成（画面は数量だけ・裏は常に根拠 measurementIds）。行を開くと内訳（各拾いの実量）、クリックで拾い→図面→頂点へジャンプ。**Summary も Evidence**（Measurement→Summary→Estimate の証拠チェーン）。**保存＝Measurement/pitch/drawingId のみ。Summary・実面積・合計は保存しない（毎回再生成）**。検証: 屋根工事8.94㎡＝屋根A4.47+屋根B4.47、内訳クリックでジャンプをヘッドレス確認。
- **Geometry Knowledge**（stretch/roof/convert）接続（面積）。次は隅棟/谷/ケラバの線にも展開。
- コンソールの黄色警告「HTML dialog … user activation」は `window.prompt`（縮尺較正）由来で**無害**。優先度低。

---

## バージョンの刻み（合意済み・「核を固めてから機能」）

小さく割って切り戻しやすく。**保存基盤→ひも付け→自動計算→Excel** の順で積む（機能追加より核が先）。

| 版 | 内容 | 状態 |
|----|------|------|
| **e0.3.1** | UI改善（日本語化 + fit）※ロジック不変 | ✅ 公開クローズ |
| **e0.3.2** | 案件・図面管理（Project / Drawing・複数ファイル/ページ・エクスプローラー） | ✅ 実装 |
| **e0.3.3** | **保存基盤**（案件ファイル / 自動保存 / 起動復元 / 世代バックアップ） | ✅ 実装 |
| **e0.3.4** | 図面ひも付け（Measurement に `drawingId`/`page` → 図面ジャンプ・図面ごと表示） | ✅ 実装 |
| **e0.3.5①** | 自動計算・実面積（勾配→伸び率→実面積）。`stretch`/`roof` 接続 | ✅ 実装 |
| **e0.3.5②** | 集計（Result Envelope。工種/項目ごとの合計＋根拠＋ジャンプ） | ✅ 実装 |
| **e0.3.5③** | **ExportResult Contract**（何を渡すか＝契約の型＋純関数。書き出しはしない） | ✅ 実装 |
| **e0.3.5④** | **Export Adapters**（どう渡すか：JSON / CSV / Clipboard） | ✅ 実装 |
| **e0.3.7①** | **Geometry Tools（勾配伸び率）** 勾配→角度/流れ・隅棟伸び率、水平距離→流れ長/隅棟長。式ベース・保存なし | ✅ 実装 |
| **e0.3.7②** | 拾い選択→勾配 自動反映（`Measurement.pitch` → Geometry Tools プリフィル・A方式） | ✅ 実装 |
| **e0.3.7③** | Recognizer 連携（AI が読んだ勾配を Geometry Tools へ） | その後 |
| **e0.3.8** | 屋根系 Geometry Tools（隅棟長さ・谷長さ。Measurement→谷線→Geometry） | その後 |
| **e0.3.6** | **Excel Adapter**（ExportResult → 積算表.xlsx。Excel も ExportResult の一利用者） | その後 |
| **e0.4系** | Recognizer / Evidence Viewer / AI補助入力 | 将来 |
| **e0.5系** | （Estimation OS 側は基本ここまで。原価・見積は KKai の責務） | — |

> 原則: 型を触るのは e0.3.4（drawingId/page）だけ。勾配伸び率は e0.3.5 で「保存するのは勾配だけ、平面積・伸び率・実面積は全部派生値」（Evidence First）。詳細は `claude/DESIGN-quantity-export.md`。

## 責務境界（重要・LOCKED方針）— Estimation OS は「拾い→数量」まで
- **Estimation OS**: `PDF → Measurement → Geometry → SummaryResult`。**ここで終わる**。概算原価・単価・歩掛・見積は**やらない**（入れた瞬間 KKai の仕事を始めてしまう）。
- **KKai**: `SummaryResult → ENGINE_MAP → calcRoof → 原価 → 見積`。**入力は SummaryResult だけ**（Geometry も Measurement も見ない）。
- 思想「甍AIは屋根を拾うことに特化する」に一致。証拠チェーン（Measurement → Summary → Export）は維持しつつ、責務が分離して両者を独立進化できる。

### ExportResult は「書き出し形式」ではなく Public Contract（Ports & Adapters）
- **ExportResult = Estimation OS が外部へ公開する唯一の契約**。下流（KKai / Excel / CSV / REST / SQLite / クラウド）は全部 **ExportResult を読む Adapter**。Estimation OS は誰が読むか知らない。
```
                      ┌── KKai Adapter    → calcRoof → 原価/見積
ExportResult ─────────┼── Excel Adapter   → 積算表.xlsx
(Public Contract)     ├── CSV Adapter     → CSV
                      └── API/DB Adapter  → REST / SQLite / クラウド
```
- ExportResult が変わらない限り、Estimation OS は下流を一切知らなくてよい。将来 Report/KCP が数量を使いたくなっても同じ ExportResult を読むだけ。**これが甍AI全体の共通言語。**
- 版分割の意味: **③＝何を渡すか（契約）** / **④＝どう渡すか（JSON/CSV/Clipboard Adapter）** / **⑥＝Excel という利用者を足すだけ**。

### ExportResult 契約（e0.3.5③ 実装済み・LOCK・`src/geometry/exportResult.ts`）
**ExportResult ＝ 甍AI の ABI**。ソース（Measurement/Geometry）は自由に変えてよいが、Export Contract v1 は守る。
```
ExportResult {
  exportContractVersion: 1,     // ★外部との約束の版（ABI major）。上がったら全 Adapter 更新
  schemaVersion: 1,             // ExportResult 自身の構造の版（約束が同じなら Adapter 据え置き可）
  app: "iraka-estimation-os", exportedAt: ISO,
  project: { name },
  summaries: SummaryResult[],   // 数量（根拠 measurementIds 付き）＝KKai の入力
  evidence: ExportEvidence[]    // 拾い単位の内訳（DTO）
}
SummaryResult  { trade, item, quantity, unit, measurementIds }
ExportEvidence { measurementId, label, drawingId?, quantity, unit, pitch? }   // ★vertices を載せない
buildExportResult(projectName, measurements, scale, exportedAt) → ExportResult // 純関数・副作用なし
```
- **2軸バージョン**: 構造(schema)を変えても約束(contract)が同じなら KKai は無修正。約束を変えたら全 Adapter 更新。
- **ExportEvidence DTO**: Measurement をそのまま晒さない。`vertices` は Estimation OS だけが知る（KKai が欲しがったら責務逆流）。内部モデル→DTO の変換を `toExportEvidence()` で一度挟む。
- 原価計算は Estimation OS に**入れない**（KKai の Adapter が ExportResult.summaries を読んで計算する）。

### Geometry Tools 原則（e0.3.7① 実装済み・`src/components/GeometryTools.tsx`）
- **電卓ではなく Geometry Knowledge の一員**。責務は `勾配 → Geometry Engine（式）→ 表示` のみ。保存しない（Evidence は `pitch` だけ）。
- **計算は式**：`stretch.area=√(1+m²)` / `stretch.hipVsHorizontal=√(2+m²)` / `stretch.hipVsSlope=√(2+m²)/√(1+m²)` / `convert.sunToDegree`。Knowledge(`pitch.json`)は**呼称辞書＋UI表示順**にのみ使用。
- **隅棟は基準3種**（`stretch.ts` にコメント固定）：`hip()`=平面対角長基準（roof.ts 実長用）、`hipVsHorizontal`=片方向水平距離基準（電卓）、`hipVsSlope`=流れ実長基準。混同して engine を書き換えない。
- **重要・持ち込み禁止**：アップロードの旧 `knowledge.js`（別コードベース `iraka-estimation-engine` v3.1）は lookup テーブルに**早見表の転記誤植を2件焼き込んでいる**（3.5寸 流れ=1.050→正1.059 / 6.5寸 隅棟対水平=1.566→正1.556）。しかもテストが誤植を期待値にして PASS するため誤りが隠れる。Estimation OS は式算出を維持し、これらのテーブルは移植しない（憲法17条の実例）。

### Geometry Tools 同期（e0.3.7② 実装済み・LOCK・A=プリフィル方式）
- **Geometry Tools ＝ ビュー兼シミュレーター**。拾いを選択→その `pitch` を初期値にプリフィル（`selectedId` 変化時のみ発火）。以後ツール内で勾配を変えて試算可。
- **Measurement を書き換えるのは「この勾配を拾いへ反映」ボタンだけ**（`onApplyPitch → setPitch`）。試算は Measurement を触らない＝Evidence First。ヘッダに「選択中 M-xxx / label / 勾配：N寸」（Measurement 側の真実）を常時表示、試算値がズレると「試算中（未反映）」バッジ。
- 将来 Recognizer（`PDF→AI→pitch`）も同じ入口（`Measurement.pitch → Geometry Tools`）に流せる＝同期ロジック再利用。
- DoD（5/5）＋ヘッドレス同期テスト13項目グリーン：選択でプリフィル / 試算でMeasurement不変 / 反映時のみ更新 / 常に選択中を表示 / tsc・build・test 緑。

### 甍AI Field — 2本立て（積算 と 電卓）＋ 電卓ロードマップ
甍AI Field（`portal.html`）は帳票置き場ではなく現場OS。現状のアクティブ導線（現場で使う順）:
`☔ 雨漏り調査報告書 / 🛠️ 工事完了報告書 / 📐 積算（拾いエディタ）/ 🧮 勾配電卓`。
**役割を分ける**（目的が違う。中身は同じ Geometry Engine を共有）:
- **📐 積算（拾いエディタ）＝ `estimation.html`**：`PDF → 拾い → Geometry → ExportResult`。図面から**数量を作る**。勾配は Evidence（拾いの属性）。Engine を**自動計算**に使う。
- **🧮 勾配電卓 ＝ `keisan.html`**：`平面図 → 手計算 → 流れ/隅棟/面積`。現場で紙図面を見ながら使う**職人の道具**。Engine を**手計算支援**に使う。式は正しい（√(1+m²) 等・検証済み）が、engine とは別に式のコピーを持つ点だけ注意（数式は固定なので実用上可）。
- 表示規則: 距離＝整数mm / 伸び率＝小数3桁 / 角度＝小数2桁（estimation の Geometry Tools は既にこの規則、keisan は距離を整数mm化済み）。

**電卓の将来像＝「屋根職人電卓」**（Estimation OS の付属ではなく独立して育てる）: 平面寸法＋勾配 →（平面積→実面積）、棟→棟包み / ケラバ→水切 / 軒先→鼻隠し / 谷→谷板、最終的に**屋根形状（寄棟・切妻・片流れ・招き・差し掛け）を選ぶだけで 屋根面積・棟・谷・ケラバ・軒先まで手計算**。

**Coming Soon の並び直し**（実際の開発順に）: `案件管理 → Recognizer（図面AI）→ KKai連携`。Excel は ExportResult の「Adapter」であって独立「機能」ではない、という位置づけに更新。

### Adapter 原則（e0.3.5④ 実装済み・LOCK・`src/geometry/exportAdapters.ts` / `src/components/ExportPanel.tsx`）
**Adapter は「ExportResult を媒体へ写すだけ」。業務ロジックを絶対に書かない。**
```
Estimation OS:  Measurement → Geometry → Summary → ExportResult
──────────────────────── Public Contract ────────────────────────
Adapters:       ├ JSON Adapter  = JSON.stringify(exportResult) 以上のことをしない
                ├ CSV Adapter   = 列を並べ替えるだけ（値は無加工・full precision）
                ├ Clipboard     = JSON テキストをそのまま clipboard へ
                └ Excel / KKai … = 将来も「ExportResult を読むだけ」
```
- **Adapter がやってはいけない**（すべて "ExportResult を変える処理"）: ㎡→坪変換 / 屋根工事だけ出力 / 数量を丸める。
- **加工が要るなら別レイヤー** `ExportResult → Transform → ExportResult`（例: 坪表示は `TsuboTransform`、CSVAdapter ではない）。
- DoD（5/5 達成）: JSON無加工出力 ✓ / CSV無加工出力 ✓ / Clipboardコピー ✓ / Adapter内に積算・変換・丸め無し ✓ / Contract v1 不変（EXPORT_CONTRACT_VERSION=1 のまま）✓。
- 検証: tsc グリーン / JSON round-trip 一致・full precision 保持 / CSV は 226.5438291 を丸めず出力・カンマ値クォート・measurementIds は `;` 連結 / ヘッドレスで App マウント・3ボタン描画・page error 0。
- 単一HTML: `dist-single/index.html`（471KB・外部アセット参照なし、pdfjs のみ CDN）。

---

## e0.3.1 完了ゲート（リリースチェックシート・公開版＋実PDFで確認）

「実装できた」≠「完了」。目的は「GitHub Pages 上で毎日使える状態」。ローカルOKでも公開版で崩れていたらリリースとは言えない。下記8項目を機械的に確認して初めて **e0.3.1 を正式クローズ**。

| # | 区分 | 項目 | 合否 |
|----|------|------|------|
| 1 | 起動・UI | GitHub Pages が正常起動する | ☐ |
| 2 | 起動・UI | PDF が読み込める | ☐ |
| 3 | 起動・UI | UI がすべて日本語表示（図形/拾い種類/面積/名称/工種/積算項目・保存/書き出しボタン・一覧見出し） | ☐ |
| 4 | View | 初回表示で図面全体が収まる（fit） | ☐ |
| 5 | View | 「全体表示」で再fitされる（パン/ズーム後に戻る） | ☐ |
| 6 | Geometry | Polygon 作図できる | ☐ |
| 7 | Geometry | **編集・頂点移動**（頂点を掴んでドラッグしてもズレない） | ☐ |
| 8 | Geometry | Measurement 保存できる | ☐ |
| 9 | Geometry | measurements.json を書き出せる | ☐ |

> No.7 を独立させた理由: 今回 fit で zoom/pan の座標変換に触れたため、Canvas座標/Screen座標/Pan/Zoom の変換に副作用があると「描けるのに頂点を掴むとズレる」バグが出やすい。2〜3分で確認できる。
> 6〜9 全体も確認する理由: ロジックには触れていないが、fit処理 / Toolbar変更 / Properties変更 の副作用可能性はゼロではない。5分で全部確認できる。
> コード上は頂点ドラッグは Konva の world 座標（`node.x()/node.y()`）を読むので transform には強い設計。だが実機で掴んで確認する。
> 数値メモ: fit の余白は現状 4%（`fitToView` の `pad = 0.96`）。きつい/緩ければこの1箇所だけ調整。
> 検証用サンプル図面: `sample_屋根伏図.pdf`（A3・屋根伏図風。棟/隅棟/下屋、4550 の較正基準線つき。実データではない）。

---

## e0.3.2 — 案件・図面管理（Project / Drawing）

**設計から始める**。いきなりコードを書かず、まずデータ構造を固める。e0.3.2 の役割は「案件には複数の図面が存在する」という世界を作ることだけ。その世界ができて初めて `drawingId`/`page` を Measurement に持たせる意味が生まれる（＝e0.3.3）。

現状は「1ファイル = 1背景」。実務は「1案件 = 図面一式」。目標のツリー:

```
Project（案件：今野様邸）
 ├─ Drawing1.pdf
 │   ├─ page1
 │   └─ page2
 ├─ Drawing2.pdf
 └─ measurements   ← 拾いは案件に属する（図面への紐付けは e0.3.3）
```

### データ構造（e0.3.2 で確定させる案・Measurement は未変更）

```
Project
 ├─ id
 ├─ schemaVersion  // ★最初から持たせる（現状 = 1）。将来の移行処理の土台
 ├─ name
 ├─ createdAt
 ├─ drawings[]     // Drawing の配列
 └─ settings

Drawing
 ├─ id
 ├─ projectId
 ├─ filename       // 例: A-06.pdf
 ├─ pageCount
 ├─ pages[]        // page ごとに背景画像（dataURL / HTMLImageElement）を保持
 └─ metadata       // 図面名(A-06 屋根伏図)・並び順 など
```

> **`schemaVersion` は e0.3.2 で足す唯一の“将来枠”**。将来 Drawing属性追加 / AI設定 / キャッシュ が必ず発生する。その時 `schemaVersion: 1` があるだけで移行処理を書ける。今ならコスト0、後からだと移行スクリプトが必要。これ以外は上記どおりで十分（余計なフィールドは足さない）。
> この段階で **Measurement 型には一切触れない**。`drawingId`/`page` を足すのは e0.3.3。
> 実装前に、この構造で DATAMODEL と齟齬がないか（Project は既存モデルのどこに載るか）を先に確認する。

- 「図面を読み込む」→ **複数選択**で取り込み、左に図面リスト:
  ```
  今野様邸
  □ A-01 表紙
  □ A-03 平面図
  □ A-06 屋根伏図
  ...
  現在表示中 ── A-06 屋根伏図
  ← 前の図面 / → 次の図面
  ```
- 毎回「図面を読み込む」を押さずに ←→ で切替。
- PDF複数ページにも対応（`getPage(n)` で 1PDF = 複数 Drawing になり得る）。
- 将来: ドラッグ&ドロップで「今野様邸.zip」（A-01.pdf … 一式）→ 案件として登録。

### e0.3.2 の作るもの（実装メモ・Measurement型には触れない）
1. `Drawing` 型を新設: `{ drawingId, name, pageIndex, image(dataURL/HTMLImageElement) }`。`Project`（軽い概念）に Drawing 配列。
2. 複数選択の取り込み（`<input multiple>`）＋ PDF 複数ページを page ごとに Drawing 化。
3. 図面リスト UI（サイドバー上部）: 一覧・現在表示ハイライト・←→ナビ。
4. 背景切替（選択 Drawing の image を Canvas 背景に）。切替時に fit（e0.3.1 の `fitToView` を再利用）。

---

## e0.3.3 — Measurement ↔ Drawing 連携（ここだけ型を触る）

- **Measurement に `drawingId?: string` / `page?: number` を追加**（任意フィールド＝既存互換。旧データは補完）。
  - 例: M-001 図面A-06 屋根面積① / M-003 図面A-04 軒高さ / M-004 図面A-05 ケラバ高さ。
  - → Measurement をクリックすると**その図面へ自動ジャンプ**。Recognizer にも効く。
- 背景切替時は drawingId で**今の図面の拾いだけ濃く**表示（他図面の拾いは薄く/非表示）。
- 変わらない原則: **vertices が真実**。drawingId/page は所属メタにすぎない。Quantity は派生ビューのまま。
- DATAMODEL.md も e0.3.3 で更新（Drawing 概念と drawingId/page を正として記載）。

> この設計は将来の AI Recognizer / Evidence Viewer / 人手積算との比較 / 複数図面横断検索 まで、そのまま拡張できる土台になる。

---

## e0.3.1 翻訳表（実施済み・記録用）

| 現在(旧) | 変更(日本語) |
|------|------|
| Geometry | 図形 |
| Operation | 拾い種類 |
| Polygon | 多角形 |
| Area | 面積 |
| Measurement | 拾いデータ |
| Measurements | 保存済みデータ |
| Label | 名称 |
| Trade | 工種 |
| Item | 積算項目 |
| Measurement を保存 | 拾いデータを保存 |
| measurements.json を書き出す | 拾いデータを書き出す |

> 内部の識別子（geometry='Polygon', operation='Area', status='editing' 等の**値**）は英語のまま。**表示ラベルだけ**日本語化（データ互換を壊さない）。
