# 甍AIシステム アーキテクチャ仕様書 Version 1.0

**制定日:** Ver4.7.2
**位置づけ:** 本書は甍AIシステムの「憲法」である。新機能を追加する際は、まず本書のどのレイヤーに属するかを確認し、レイヤーの役割を越境する実装をしない。もし既存レイヤーのどこにも当てはまらない機能が出てきた場合は、先に本書を改訂してから実装に着手する。

---

## 0. 設計思想（不変の前提）

> AIが積算するのではなく、職人の判断プロセスをデータ構造へ翻訳する。

- 甍AIの価値は「数量を出すこと」ではなく、「なぜその数量になったのかを、図面まで戻って説明できること」にある。
- したがって、**新しい計算ロジックを追加するより先に、既存のデータがどのレイヤーに責任を持つかを明確にすることを優先する。**
- 谷板金・軒・ケラバ等、部材の種類によってレイヤー構造を変えない（特別扱いしない）。

---

## 1. レイヤー構成（1枚表）

| Layer | 役割 | 入力 | 出力 | 他レイヤーとの関係 | 実装状況(Ver4.7.1時点) |
|---|---|---|---|---|---|
| **Drawing** | 実ファイルの管理（立面図・平面図・屋根伏図等） | アップロードされたPDF/画像 | View | Viewを子に持つ（1つのDrawingに複数のView） | ✅ 実装済み（`drawings`オブジェクト、DRAWING_SLOTS） |
| **View** | 図面内の参照領域（南立面・北立面等） | Drawing + 矩形範囲指定 | Calibration・Annotationの器 | Drawingに属する（親子） | ✅ 実装済み（`VIEWS`配列、矩形登録） |
| **Calibration** | Viewごとの縮尺（px/m） | Viewに引いた既知長の線 | px/mレート | **Viewに属する**（Drawing単位ではない） | ✅ 実装済み（`view.calibration`、Ver4.7.1で修正） |
| **Annotation** | 点・線・矩形の記録 | View + 描画操作 | 実長（Geometry入力）・座標・ラベル | Viewに属する（Viewが無いAnnotationは存在しない） | ✅ 実装済み（`ANNOTATIONS`配列、`viewId`必須） |
| **Geometry** | 幾何計算（実長・勾配補正・角度） | Annotation座標 + Calibration | 実長・角度（勾配補正後） | Annotationを受け取りEngineへ渡す | ⏳ **未実装**。現状はAnnotation登録時に実長を手入力/単純比例計算のみ。勾配補正・角度計算は無い |
| **Engine** | Component単位の数量計算（屋根タイプ判定・面積・長さ・換気・排水） | 寸法入力 or （将来的に）Geometry出力 | Component（数量のみ） | Knowledge(Rule)を参照する | ✅ 実装済み（`detectRoofType`, `calcRoofAreas`, `calcLengths`等）。**ただし現状はGeometry経由ではなく寸法欄の手入力を直接使用** |
| **Knowledge (Rule)** | 計算ルールの定義（RULE-001〜） | - | Engineが参照する係数・分岐条件 | Engineに埋め込み | ⚠️ **部分実装**。RULE番号はコード内コメント・Evidence表示用ラベルとして存在するが、外部ファイル化・バージョン管理されたRuleエンジンとしては未整備 |
| **Assembly** | 部材構成（Componentの組み合わせパターン） | Component | 部材リスト | Estimate Mappingへ渡す | ⚠️ **設計乖離あり**。`src/assembly/`にAssemblyFactory等が存在するが、現行の`estimate.html`の計算フローには接続されていない（後述4章） |
| **Product Catalog** | 屋根仕様ごとの製品定義（立平333/455、横暖ルーフ等） | 屋根仕様選択 | 商品名・係数(multiplier) | Estimate Mappingが参照 | ✅ 実装済み（`knowledge/products/roof_products.json`） |
| **Estimate Mapping** | Component→Estimate Itemへの変換規則 | Component + Product Catalog | Estimate Item（商品名・工種・摘要・係数） | Componentを商品化する層 | ✅ 実装済み（`knowledge/estimate/estimate_mapping.json`、`getEstimateItem()`） |
| **Estimate Quantity** | 係数・ロス率適用後の見積数量 | Component数量 × Estimate Mapping係数 | 見積数量 | Excel出力の直接の元データ | ✅ 実装済み（`getEstimateQty()`） |
| **Estimate Template** | 見積書フォーマット（甍見積／見積依頼書／公共工事） | Estimate Quantity | Excelファイル | `knowledge/estimate/templates.json`を参照 | ✅ 実装済み |
| **Evidence** | 判断根拠（Observation/Reasoning/Calculation/Evidence の4層） | Engine計算過程 + Annotation参照 | UI表示・（将来）JSON | Annotationを参照する | ✅ 実装済み（4層表示、Annotation紐づけ表示） |
| **Comparison** | AI値／人積算値／採用値の三者比較 | Evidence + 人の入力 | 差分・採用値 | Estimateと並列表示 | ✅ 実装済み |
| **Learning** | 差分・理由の記録 | Comparisonの差分＋理由入力 | 学習ログ | 将来Knowledge更新へつながる予定 | ⚠️ **簡易実装のみ**。ブラウザのlocalStorageに保存するだけで、Observation→Reasoning→Calculation→Difference→RuleCandidate→Knowledge更新という設計は未着手 |
| **Teacher Data** | 人が積算した資料そのもの | アップロードされた資料 | （将来）Rule候補抽出の元データ | Learningの入力になる予定 | ⏳ **未実装**。今は参照表示のみ、自動抽出なし |
| **Roof Reconstruction (屋根伏図生成)** | 平面図＋立面図から屋根伏図を推定生成 | View + Geometry | 屋根伏図（新規Drawing） | Geometry Engine完成後の応用 | ⏳ **未実装**（構想段階） |

---

## 2. データフロー図（全体）

```
Drawing
  ↓ (Viewを切り出す)
View
  ↓ (実寸で校正する・Viewごとに独立)
Calibration
  ↓ (点・線・矩形を記録する)
Annotation
  ↓ (実長・角度を計算する)  ※未実装
Geometry
  ↓ (Ruleを適用し数量を出す)
Rule Engine（Knowledge）
  ↓
Engine（数量計算） → Component
  ↓ (部材構成にまとめる)  ※現行フローでは未接続
Assembly
  ↓ (商品に変換する)
Estimate Mapping（Product Catalog参照）
  ↓ (係数・ロス率を適用する)
Estimate Quantity
  ↓ (テンプレートで出力する)
Estimate（Excel）
```

**横から生成される層（すべての段階から参照可能）:**

```
Observation（何を見たか）
  ↓
Reasoning（なぜそのRuleを選んだか）
  ↓
Calculation（どう計算したか）
  ↓
Evidence（確定値・確信度・Annotation参照）
```

Evidenceは「Engineが何を計算したか」だけでなく、「Annotationのどの線を根拠にしたか」まで参照できる状態を目指す（現状は同一Component名でのゆるいマッチングまでで、1:1の紐づけは次フェーズ）。

---

## 3. レイヤー境界の判断基準

新機能を作る前に、以下の順番で自問する。

1. **これは実ファイルの話か？** → Drawing
2. **これは図面内のどの領域を見るかの話か？** → View
3. **これは縮尺・単位の話か？** → Calibration（Viewに属する）
4. **これは図面上の点・線・矩形の記録か？** → Annotation（Viewに属する）
5. **これは実長・角度・幾何学的な計算か？** → Geometry（未実装。ここに実装先を作る）
6. **これはルール（RULE-xxx）に基づく数量計算か？** → Engine / Knowledge(Rule)
7. **これは部材の組み合わせパターンか？** → Assembly
8. **これは「数量→商品名」の変換か？** → Estimate Mapping（Product Catalogを参照）
9. **これは係数・ロス率・丸めの話か？** → Estimate Quantity
10. **これは見積書のフォーマットの話か？** → Estimate Template
11. **これは「なぜこの値になったか」の説明か？** → Evidence
12. **これは人との比較・差分の話か？** → Comparison / Learning

**やってはいけないこと:**
- Engineの中でComponentの商品名を決めない（Estimate Mappingの仕事）
- Annotationに直接Estimate Itemを持たせない（Componentを経由する）
- Viewを介さずにDrawingへ直接Annotationを紐づけない（親を必ず持つ）
- Calibrationをドキュメント単位・アプリ単位で共通化しない（View単位を維持する）

---

## 4. 既知の設計負債（正直な記録）

本書は理想像ではなく現状の記録でもある。以下は「憲法」と「実装」がまだ一致していない箇所であり、次フェーズ以降で解消する対象として明記しておく。

1. **Assemblyレイヤーの断絶**：`src/assembly/`にAssemblyFactory等のコードが存在するが、`estimate.html`の実際の計算フロー（`calcRoofAreas`〜`calcDrainage`）はこれを経由せず、Component相当の値を直接生成している。将来Geometry Engineを実装する際に、Assembly層を実際のデータフローへ接続し直す必要がある。
2. **Rule Engineの未整備**：RULE-001等の番号はEvidence表示用のラベルとして使われているが、Ruleそのものを外部ファイル化・バージョン管理する仕組みはまだ無い。`knowledge/rules/`にJSONは存在するが、Engineコードは現状これを動的に読み込まず、ロジックがハードコードされている箇所が多い。
3. **Geometry Engineの不在**：Annotationで線を引いても、勾配補正や角度計算は行われていない（単純な比例計算のみ）。谷や片流れ屋根のような斜面上の実長を正確に扱うには、この層の実装が必須。
4. **Learning Engineの簡易実装**：ブラウザのlocalStorageに保存するのみで、複数端末・複数ユーザー間での共有や、Observation〜RuleCandidateへの構造化はされていない。
5. **Evidence↔Annotationの紐づけがComponent名ベース**：同じComponent（例：谷）を複数登録した場合、どのAnnotationがどのEvidence行の根拠かを一意に特定できない。将来は`annotationId`をEvidence行に直接持たせる設計にする。

---

## 5. 改訂ルール

- 新しいレイヤー（例：Geometry Engine, Rule Engine, Learning Engine, Roof Reconstruction）を実装する際は、**実装前に本書のテーブルへ行を追加または`⏳ 未実装`を`✅ 実装済み`に更新する。**
- レイヤーの役割を変更する場合（例：CalibrationをView単位からDrawing単位に戻す等）は、なぜ変更するかの理由をこのファイルの変更履歴として残す。
- 本書と実装が矛盾する状態を放置しない。矛盾に気づいた時点で「4. 既知の設計負債」に追記する。

---

*本書はVer4.7.2にて甍AIシステムの開発方針を定めるために作成された。以降のVer5系（Geometry Engine, Rule Engine, Learning Engine, Teacher Data, Roof Reconstruction）は、すべて本書のレイヤー構造に従って実装されるべきである。*
