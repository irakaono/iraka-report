# 甍AI Estimation OS — データモデル（e0.2 / Data Model Complete）

> このファイルが **設計の正**である。
> `積算表.xlsx` は、この設計が正しいことを証明する **サンプル**にすぎない。
> 主従を逆にしない。Excel が資産なのではない。**判断と拾い（geometry）が資産**である。

---

## 0. e0.2 のゴール — Data Model Complete

> **「このデータ構造なら、どんな帳票でも出せる」——これを証明すること。**

このタグは「Data Model Complete」を名乗る。だから **データモデルの思想が揺れない状態**で切る。
真実は1つ：**Measurement の vertices（かたち）だけ**。それ以外はすべて計算で導く派生物である。

### 一本道（本線）

```
Project
   ↓
Decision（判断）
   ↓
Measurement（拾い：vertices を置く）★唯一の真実
   ↓
Geometry Engine（vertices → 値を計算）
   ↓
Quantity View（集約：保存しない派生ビュー）
   ↓
Estimate（金額：最後）
   ↓
Document Engine → Template（Excel / PDF / JSON …）
```

### 入力ライン（vertices を書くのは誰か）

```
Recognizer     →  Geometry           （PDF → かたち。それだけ）
Geometry Editor →  Measurement(vertices)（人が描く・直す）
```

AI が無くても OS は成立する（人が Geometry Editor で描く）。
AI（Recognizer）が入れば「Geometry Editor に初期値を入れる存在」として価値だけが積み上がる。

---

## 1. モデルは5つ（＋ Quantity は派生ビュー）

```
Project        （案件 = SSOT。Field と共有。読むだけ）
Decision       （判断：何を・なぜ・誰が）
Measurement    （拾い：vertices。唯一の永続的な真実）
Quantity View  （集約：保存しない。毎回 Measurement から生成）
Estimate       （金額：最後）
```

**Operation（施工手順）と Knowledge（辞書）は参照するだけ**で、e0.2 では定義しない。
ただし Geometry Engine が引く **Geometry Knowledge** は、この Knowledge の一部（第4章）。

---

## 2. Project（案件 = SSOT）

```
Project
├ id / name / ...（Field が管理）
└ extensions.estimation : { estimationId, status, updatedAt }   ← Estimation はこれを読む
```

成果物本体は **Estimation Store**（別ストア）に持つ。Project コアは書き換えない（原則7・8）。

---

## 3. Decision（判断）— OS の核

```
Decision
├ decisionId / projectId / estimationId
├ type    // RoofShape / RoofPitch / RoofMaterial / SnowStop / Karakusa …
├ value   // "横暖S" / "片流れ" / "雪止め必要"
├ basis   // なぜそう判断したか（配列・原則13）
├ confidence / author（human|ai・原則14）
├ supersedes  // 上書きせず追記（原則12）
├ schemaVersion / createdAt / createdBy
```

規律: `basis` 空は不可。修正は新 Decision＋`supersedes`。human/ai 同一スキーマ。

---

## 4. Measurement（拾い）— vertices が唯一の真実

数量「18.5㎡」は、実は **Polygon → 面積計算 → 18.5**。だから保存するのは **かたちだけ**。

```
Measurement
├ measurementId / projectId / estimationId
├ operation   // 何を計算するか: Area / Length / Count
├ geometry    // かたち: Polygon / Line / Polyline / Point
├ vertices    // 座標列。★唯一の保存値（真実）
├ label       // この拾いの名前。例: "屋根面A"
├ trade       // 集約先の工種。例: "屋根工事"
├ item        // 集約先の名称。例: "横暖S 本体"（同じ item は1行にまとまる）
├ unit        // ㎡ / m / 個
├ drawingRef / layer
├ basisDecision  // 紐づく判断（原則13）
├ method      // manual / cad / pdf-annot / ai
├ schemaVersion / createdAt / createdBy
```

> **amount は保存しない。** Geometry Engine が vertices から計算する。
> 頂点を1つ動かせば面積が再計算され、Quantity View まで自動で更新される。これは CAD そのもの。

### Geometry Engine は拡張しない。Knowledge を増やす（②）

Geometry Engine は `geometry` と `operation` を受け取るだけ。**何を計算できるかは Geometry Knowledge が持つ**。

```
Geometry Engine
      │  受け取るのは (geometry, operation) だけ
      ▼
Geometry Knowledge（辞典）
   Polygon  → Area / Perimeter / Centroid / BoundingBox …
   Polyline → Length / OffsetLength …
   Point    → Count …
```

将来 Perimeter や Centroid が増えても、**エンジンは変えない。Knowledge に1行足すだけ**。
これは Operation 辞典と同じ思想（エンジンは薄く、知識は資産）。依存は `Geometry Engine → Knowledge` の一方向。

| geometry | operation（例） | 計算 |
|---|---|---|
| Polygon | Area | 面積（シューレース公式） |
| Line / Polyline | Length | 長さ（線分の総和） |
| Point | Count | 個数（点の数） |

---

## 5. Quantity View（集約）— 保存しない派生ビュー（①）

amount を保存しないなら、Quantity も **保存する必要がない**。
Quantity は Measurement を `(trade, item, unit)` で束ね、Geometry Engine の値を合計した **派生ビュー**である。

```
Measurement（複数・同じ item）
        │  group by (trade, item, unit)
        ▼
Quantity View = { trade, item, unit, measurements[], amount = Σ GeometryEngine(m) }
```

- Quantity は永続化しない。**毎回 Measurement から生成できる**。
- 真実は vertices のみ。Quantity はその見え方（ビュー）にすぎない。
- **大量データで速度が要るときだけ `Quantity Cache` を足す**。ただしキャッシュは実装であって真実ではない。
  キャッシュが壊れても、vertices から再生成すれば必ず同じ値に戻る。

規律: Quantity View は必ず1つ以上の Measurement から生成される。空の item は存在しない。

---

## 6. Estimate（金額）— 最後

```
Estimate
├ estimateId / quantityRef / unitPrice / subtotal / supplier
├ schemaVersion / createdAt / createdBy
```

同じ数量から、実行予算（原価）と見積書（売価）で違う金額が乗る。だから数量と金額は分ける。

---

## 7. Document Engine（帳票エンジン）

```
Decision + Measurement + Quantity View (+ Estimate)
        │
        ▼
   Document Engine
        ├─ Document: 積算表 / 見積書 / 実行予算 / 発注書 / 内訳書
        └─ Template : Excel / PDF / JSON …
```

帳票 = データ ＋ Document（どの帳票か）＋ Template（どの形式か）。
データは一つ。Document と Template を替えるだけで、住宅でも公共工事でも、Excel でも PDF でも出る。

---

## 8. Recognizer の責務（③）— PDF → Geometry だけ

Recognizer は **Geometry を生成するだけ**。それ以外は一切書かない。

```
Recognizer
   PDF → Geometry（vertices の初期値）
   ×  Decision は書かない
   ×  Measurement を完成させない（人が trade/item/basisDecision を与える）
   ×  Quantity / Estimate / Document は書かない
```

Recognizer が出した Geometry も、人が手で描いた Geometry も、
最終的には同じ **Geometry Editor** で直す。だから Editor が先、Recognizer が後（第10章）。

---

## 9. 不変条件（invariants）

1. **真実は Measurement.vertices のみ**。amount / Quantity は保存しない（派生値）。
2. **Measurement は geometry・operation・vertices を持つ**。
3. **Measurement は1つ以上の Decision に紐づく**（`basisDecision` 非空）。
4. **Decision は `basis` を持つ**（根拠のない判断は不可）。
5. **Quantity は派生ビュー**。永続化しない（必要時のみ Cache、ただし真実ではない）。
6. **判断は上書きしない**（新 Decision＋`supersedes`）。
7. **金額は数量と分離**（Quantity と Estimate は別）。
8. **全レコードに `schemaVersion`**。
9. **Estimation は Project を書き換えない**。
10. **Geometry Engine は拡張しない**。計算能力は Geometry Knowledge が持つ。

追跡の一本道: `積算表の行(Quantity View) → Measurement(geometry) → Decision`。

---

## 10. ロードマップ（タグごとに責務は一つ）

| タグ | テーマ | 内容 | 状態 |
|------|--------|------|------|
| `e0.1-constitution` | 理念 | README / ARCHITECTURE / CONSTITUTION | ✅ |
| `e0.2-datamodel` | **Data Model Complete** | 5モデル＋Quantity View。amount非保存・vertices が真実 | ◀ 今ここ |
| `e0.3-geometry-editor` | Geometry Editor | PDF表示＋頂点編集 → Measurement(vertices) | |
| `e0.4-geometry-engine` | Geometry Engine | Knowledge駆動で vertices → 値を計算 | |
| `e0.5-document-engine` | Document Engine | 積算表 → 見積書 → 実行予算 → 発注書 | |
| `e0.6-recognizer` | Recognizer | PDF → Geometry を自動生成（AI は初期値係） | |
| `e0.7-roof` | Roof Engine | 屋根特有の拾い・伸び率・納まり | |
| `e0.8-wall` | Wall Engine | 外壁特有の拾い | |
| `e1.0-estimation-os` | 統合 | 住宅も公共工事も同じ OS | |

> **Geometry Editor が Geometry Engine より先**。エンジンがあっても、人が使う編集面が無ければ回らない。
> Recognizer はその後で足せばよい。AI が無くても OS は成立する設計を先に完成させる。

> 注: CONSTITUTION.md 第6節の暫定タグ一覧は、本ロードマップが上書きする。次の憲法改訂で揃える。

---

## 11. e0.2 の完了条件

```
Project → Decision → Measurement(vertices) → Geometry Engine → Quantity View → Estimate → Document Engine → Template
                                                   ▲
Recognizer → Geometry ─┐                           │
Geometry Editor ───────┴→ Measurement(vertices) ───┘
```

この図が成立し、サンプルで
`積算表(Quantity View) → Measurement(geometry) → Decision` を辿れ、
かつ **amount / Quantity が vertices から計算・生成で出る（保存ゼロ）**ことを示せれば、
**e0.2-datamodel（Data Model Complete）** は完了。
