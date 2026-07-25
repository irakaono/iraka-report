# 甍AI Estimation OS — 設計憲法（Constitution）

> Field 憲法（原則1〜11）を **親憲法**として継承する。
> ここでは、その継承を確認したうえで、積算OS固有の補足原則を定める。

```
Field Constitution（原則 1〜11）
        │
        └── Estimation Constitution（本ファイル：継承 + 積算向け補足）
```

---

## 0. 最上位原則（Platform 共通）

**Project は会社で唯一の真実（Single Source of Truth）である。**
Field OS と Estimation OS は、その周りに立つ **兄弟** であり、上下関係はない。
**AI は兄弟ではなく、両 OS を横断するレイヤー**である（独立した「AI OS」は作らない）。
Estimation OS は Project を書き換えない。`extensions.estimation` を読むだけである。

**API は状態を持たない（stateless）。** `currentProject` のような選択状態を持たず、常に `projectId` を渡す。

---

## 1. Estimation OS の目的（変えてはならない定義）

> **甍AI Estimation OS は、数量を自動で出すAIではない。**
> **積算という「判断」を記録し、理解し、再利用するためのOSである。**

この定義が最上位の制約である。
機能追加・最適化・AI 高度化のいずれも、この定義に反してはならない。
「数量を当てる」ことが「判断を残す」ことを損なうなら、判断を残す方を採る。

---

## 2. Field から継承する原則（1〜11）

Field 憲法の原則を、Estimation の文脈で読み替えて継承する。

1. **本体と参照を分ける** — 判断ログに巨大なバイナリ（図面画像等）本体を埋めない。本体は別に持ち、参照で繋ぐ（原則1の継承）。
2. **全記録に `schemaVersion`** — 判断ログ・拾い・見積、すべてにスキーマ版を持たせる。
3. **`projectId` で案件に紐づける** — すべての積算成果は案件に属する。
4. **成果は正しい親に紐づける** — 判断ログは `estimationId` と `projectId` に紐づける。
5. **旧データの自動移行はしない** — 旧積算データの黙った変換をしない。移行は明示フェーズで行う。
6. **将来拡張は `extensions` / `metadata` で受ける** — 積算コアのレコードは固定しない。
7. **Project を唯一の真実（SSOT）とする。** 全機能は案件に属する。
8. **API は状態を持たない（stateless）。** `Project.extensions.estimation` を読むだけで、Project を書き換えない。
9. **品質ゲート** — 自己テストが PASS しない限り、新機能はマージしない（Field の Recovery ゲートに相当）。
10. **Backward Compatibility First** — 既存の積算運用・過去見積を壊さない。新実装は移行期間中、旧運用と必ず共存する。
11. **テストは本番と同じ API を使う** — 自己テストは積算の本番 API を直接叩く。テスト専用の別実装を作らない。

---

## 3. Estimation 固有の補足原則（12〜16）

Field には無い、積算OSだけの規律を足す。

12. **判断は消さない、追記する。**
    判断の修正は上書きではなく追記で残す。「誰が・いつ・なぜ変えたか」が辿れること。
    見積の一点を残すのではなく、そこへ至る判断の履歴を残すのが本OSの本体である。

13. **すべての判断に根拠（basis）を持たせる。**
    数量・単価・区分けは、必ず「なぜそうしたか」（引いた Knowledge や人の意図）とともに記録する。
    根拠のない数字は、再利用できない資産である。

14. **AI は判断を代行せず、補助し記録する。**
    AI の提案は `actor=AI` として残し、人の承認・修正は `actor=human` として追記する。
    最終成果には、人と AI のやり取りの履歴が含まれる。

15. **Knowledge は読むが、勝手に汚さない。**
    各エンジンは Knowledge を参照するのみ。辞書への反映は、判断が確定した時に
    明示的なフィードバック経路を通してのみ行う。自動で辞書を書き換えない。

16. **段間は疎結合（パイプライン規律）。**
    Recognizer → Roof → Operation → Estimate → Converter は、隣とだけデータで繋ぐ。
    同階層のエンジンは直接呼び合わず、束ねるのは `estimation-api`。

17. **Knowledge はコードではない。資産である。**
    Material / Rule / Geometry / Operation / Decision History は、すべて `knowledge/` 配下の
    データとして持つ。Python にも JavaScript にも **埋め込まない**。
    理由は二つ。**LLM が後で読む**こと。そして **人が編集する**こと。
    知識をコードに埋めた瞬間、それは会社の資産ではなくなり、エンジニアの持ち物になる。
    Knowledge は誰でも読めて、誰でも直せる、会社の資産でなければならない。
    これは今この時点で決める。後から剥がすのは非常に高くつく。

18. **正規結果はひとつ（Canonical Result Principle）。**
    Estimation OS の唯一の正規な公開結果は `ExportResult` である。これは「書き出し形式」でも
    単なる ABI でもなく、**製品の心臓部となる正規データ（Canonical Model）**である。
    JSON / CSV / Excel / KKai / REST / データベース / 将来のアプリは、すべて `ExportResult`
    から派生するだけ。いかなる Adapter も外部アプリも、`ExportResult` を迂回して内部ドメイン
    モデル（`Measurement` / `Geometry` / `vertices`）へ直接アクセスしてはならない。

    入口が人でも AI でも結果は同じ：Human も Recognizer(AI) も作るのは `Measurement` まで。
    その後 `Measurement → Summary → ExportResult` は不変で、**AI が入っても ExportResult は変わらない**。
    Report も将来 `写真 → AI 解析 → Evidence → ReportResult` という同じ形（各ドメインに
    Canonical Result をひとつ）を採る。加工が要るなら Adapter ではなく
    `Canonical Result → Transform → Canonical Result` を別レイヤーで足す。

    ```
                  AI
                   │
    Human ─────────┤
                   ▼
             Domain Model（Measurement / Geometry）   ← 内部。外へ晒さない
                   │
                   ▼
          Canonical Result（ExportResult）            ← 唯一の正規・製品の心臓部
                   │
            (Public Contract)
                   │
         ┌─────────┼─────────┐
         ▼         ▼         ▼
       JSON      Excel      KKai …（すべて派生するだけ）
    ```

    Canonical Result Principle (binding):
    Estimation OS has exactly one canonical public result (`ExportResult`).
    All external integrations (JSON, CSV, Excel, KKai, REST, databases, future
    applications) must derive from `ExportResult`. No adapter or external
    application may bypass `ExportResult` and access internal domain models
    (`Measurement`, `Geometry`, `vertices`) directly.

---

## 4. 開発フロー（安全ゲット — Field と同一思想）

新機能は「動く」だけでは出さない。**自己テストが PASS してから**確定する。

```
新機能 完成
   ↓
セルフテスト（PASS ×3）
   ↓
GitHub push → タグ
   ↓
次の開発へ
```

自己テストは使い捨てではなく、**製品の一部**として同梱する（Field 原則11）。

---

## 5. Project 連携の規律

```
Project（SSOT）
   └ extensions.estimation : { estimationId, status, updatedAt }   ← Estimation はこれを読むだけ

Estimation Store（別ストア・Estimation が所有）
   ├ 判断ログ（各段の decision / basis / actor）
   ├ 拾い結果
   └ 見積
```

- Estimation OS は `Project.extensions.estimation` を **読み取り専用**で参照する。
- 成果物本体は Estimation 側のストアに置く。Project コアは変更しない。
- Field と Estimation は、この境界を越えて互いの内部に踏み込まない。

---

## 6. リリースタグ（進化の履歴）

Field の `v4.0-estimation` は「Field 側から見た積算接続点」。
Estimation OS 自身は独立した版で刻む。

```
e0.1-constitution   → 理念・設計・憲法の確定（README / ARCHITECTURE / CONSTITUTION）
e0.2-datamodel      → 判断ログ / Estimation Store / Project 連携
e0.3-recognizer     → 図面から「何を見たか」を残せる
e0.4-roof           → 屋根の判断
e0.5-estimate       → 拾いと計算
e1.0-converter      → 見積フォーマットへの変換（一本道が繋がる）
```

---

## 7. 迷ったときに戻る場所

判断に迷ったら、この順で戻る。

1. 第1条の定義 —「数量を出すAIではない。判断を残すOSである」
2. 最上位原則 — Project が SSOT / API は stateless
3. 継承した原則 1〜11
4. 固有原則 12〜18（18 = 正規結果はひとつ / Canonical Result Principle）

憲法＝何を守るか。実装＝どう守るか。
数万行を書いても、守るべきものはこの一枚に収まっている。
