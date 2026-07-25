# 甍AI Estimation OS — 全体設計（Architecture）

> 数量を当てるための設計ではない。
> **判断を、順を追って残すための設計**である。

---

## 0. 設計の原点

Estimation OS の目的（`README.md`）は、積算の判断を記録し・理解し・再利用すること。
だからアーキテクチャも、「入力→出力」の変換器ではなく、
**判断が流れていく一本のパイプライン**として設計する。

各段は、次の段に渡すと同時に「自分が何をしたか」を必ず残す。
この“残る”性質こそが、普通の積算ソフトと分かれる点である。

---

## 1. パイプライン

```
図面
  │
  ▼
Recognizer        図面から「何を見たか」を起こす
  │
  ▼
Roof Engine       屋根としてどう捉えるか（形状・面・勾配の判断）
  │
  ▼
Operation Engine  積算の操作（拾い・数え方・区分けの判断）
  │
  ▼
Estimate Engine   どう計算したか（数量・歩掛・単価の適用）
  │
  ▼
Converter         見積へ変換（社の見積フォーマットへ）
  │
  ▼
見積
```

各段の責務:

| 段 | 入力 | 残すもの（判断の記録） | 出力 |
|----|------|----------------------|------|
| Recognizer | 図面 | 何を見たか（線・記号・寸法の読み取り根拠） | 認識結果 |
| Roof Engine | 認識結果 | 屋根としての解釈（面・勾配・納まりの判断） | 屋根モデル |
| Operation Engine | 屋根モデル | 拾いの操作・区分けの判断 | 拾い結果 |
| Estimate Engine | 拾い結果 | どの歩掛・単価をなぜ選んだか | 数量・金額 |
| Converter | 数量・金額 | 見積書への写像ルール | 見積 |

**重要**: 各段の「残すもの」列こそが本体である。出力列だけを残すなら、それはただの積算ソフトになる。

---

## 2. Knowledge — 全段を横断する“辞書群”

Knowledge は一枚岩ではない。最初から **役割の異なる複数の辞書**に分ける。
一個の Knowledge で始めると、数か月で巨大化して手がつけられなくなる。

```
   ┌──────────────── Knowledge ────────────────┐
   │  Material                                  │
   │  Rule                                      │
   │  Geometry                                  │
   │  Operation                                 │
   │  Decision History                          │
   └────────────────────┬───────────────────────┘
                        │（各エンジンは、自分に必要な辞書だけを読む）
   Recognizer / Roof / Operation / Estimate / Converter
```

| 辞書 | 内容 | 主に引くエンジン |
|------|------|-----------------|
| **Material** | 材料・部材（名称・単位・規格） | Estimate / Converter |
| **Rule** | 歩掛・標準単価・区分の規則 | Estimate / Operation |
| **Geometry** | 形状・納まりのパターン（この形状ならこの拾い方） | Roof / Recognizer |
| **Operation** | 拾い方・数え方・区分けの手順 | Operation |
| **Decision History** | **判断の履歴**（この屋根だから → こう判断した → 結果こうだった）。**案件集ではない。** | 全段（提案の裏付け） |

各エンジンは、自分に必要な辞書 **だけ**を読む。Recognizer・Roof・Estimate は
それぞれ違う知識を見る。だから辞書も最初から分けておく。

各エンジンは Knowledge を **読むだけ**。書き込みは、判断が確定した時に
明示的なフィードバック経路を通してのみ行う（勝手に辞書を汚さない）。
これは「再利用（Reuse）」を安全に回すための規律である。

> Knowledge は **コードではない**。人が編集し、LLM が読む会社の資産である（憲法 原則17）。
> だから Material / Rule / Geometry / Operation / Decision History は、
> Python や JavaScript に埋め込まず、すべて `knowledge/` 配下のデータとして持つ。
>
> **Decision History は「過去案件の集まり」ではない。** 「この屋根だから → こう判断した → 結果こうだった」
> という **判断の履歴**である。案件を貯めるのではなく、判断を貯める。ここが再利用の源泉になる。

---

## 3. Project との関係 — 読むだけ、書き換えない

```
      Project（SSOT）
          │
   extensions.estimation ──►  { estimationId, status, updatedAt }
          │                         │
          │                         ▼
          │                  Estimation Store（別ストア）
          │                  ├ 判断ログ（各段の「残すもの」）
          │                  ├ 拾い結果
          │                  └ 見積
          ▼
      （Field が reports / photos を書く）
```

- Estimation OS は `Project.extensions.estimation` を **読むだけ**。
- 自分の成果物（判断ログ・拾い・見積）は **Estimation 側のストア**に持つ。
- Project コアは書き換えない。参照キー（`estimationId` 等）を置くのみ。
- この分離により、Field と Estimation は互いを壊さずに独立進化できる（Backward Compatibility）。

---

## 4. レイヤー依存

Field 憲法のレイヤー規律をそのまま踏襲する（下が土台、上は下だけに依存）。

```
knowledge
  ↓
recognizer / roof-engine / operation / estimate / converter（同階層は直接依存しない）
  ↓
estimation-api（オーケストレーター）
  ↓
UI（画面）
```

同階層のエンジンどうしは直接呼び合わない。束ねるのは `estimation-api`。
これは Field の `field-api` と同じ思想である。

---

## 5. データが“残る”という設計要件

各段は、処理結果だけでなく **判断の記録**を必ず永続化する。
最低限、各判断ログは以下を持つ:

```
{
  stage,          // recognizer / roof / operation / estimate / converter
  input,          // 何を入力に
  decision,       // 何を判断したか（人 or AI）
  basis,          // なぜそう判断したか（根拠・引いた Knowledge）
  actor,          // 人／AI／どちらの合議か
  schemaVersion,  // 全記録にスキーマ版（Field 原則2の継承）
  createdAt
}
```

`schemaVersion` は全記録に持たせる（Field 原則2）。
将来の拡張は `extensions` / `metadata` で受ける（Field 原則6）。

---

## 6. AI と人の関係

Estimation OS では、AI は判断を**代行しない**。判断を**補助し、記録する**。

- AI は「見た」「こう思う」を提案する（`decision` に actor=AI として残る）。
- 人はそれを承認・修正する（actor=human の判断として上書きではなく追記で残る）。
- 最終的に残るのは、両者のやり取りを含む判断の履歴である。

これが「人の積算判断を AI と一緒に残す OS」の技術的な意味である。

---

## 7. 段階的な作り方

一度に全段は作らない。判断が残る器を先に立て、エンジンは後から差し込む。

```
Phase A  データモデル（判断ログ / Estimation Store / Project 連携）
Phase B  Recognizer（まず「何を見たか」を残せる状態に）
Phase C  Roof Engine（屋根の判断）
Phase D  Operation / Estimate（拾いと計算）
Phase E  Converter（見積フォーマットへ）
Phase F  Knowledge の充実（再利用が回り始める）
```

各 Phase は、Field と同じ **品質ゲート**（自己テストが PASS してから確定）を通す。
詳細な規律は `CONSTITUTION.md` を参照。

---

## 8. Future Work — Semantic Mapping（将来の拡張ポイント・e0.2 では実装しない）

Measurement は、実は **2種類の情報の複合体**である。

```
Measurement ＝ Geometry（図面上の実体） ＋ Semantic（積算上の意味）
   ├ Geometry : geometry / vertices / drawingRef / layer   … 図面にある「かたち」
   └ Semantic : trade / item / basisDecision               … 「これは横暖S本体」という意味付け
```

Recognizer が PDF から作れるのは **Geometry だけ**。
そのあと AI や人が「この Polygon は 屋根面A → 横暖S本体 → 屋根工事」という **意味付け**を与える。
つまり将来、両者の間に **Semantic Mapping** 層が入り得る。

```
Geometry
   ↓
Semantic Mapping   ← AI / 人が意味を与える（Recognizer はここまで来ない）
   ↓
Measurement（Geometry ＋ 意味）
```

**e0.2 では新モデルを追加しない**（データモデルは5つのまま）。
ここに図として記録だけ残す。将来 Recognizer を賢くする時、
あるいは屋根だけでなく **設備・電気**まで扱う時に、この層を自然に足せるようにしておく。
