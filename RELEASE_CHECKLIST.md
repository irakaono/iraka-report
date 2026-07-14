# 甍AI Platform — 設計憲法（Constitution）

> 甍の現場OS。単一の「案件（Project）」を会社で唯一の真実とし、
> 現場・積算・工程・発注・AI をすべてその周りに集める。

---

## 0. 最上位原則

**Project は会社で唯一の真実（Single Source of Truth）とする。**
報告書・写真・積算・工程・発注・点検・保証・OB管理 —— すべては案件に属する。
機能が何本増えても、中心は常に案件ひとつ。社員によって違うのは「見える画面」だけ。

**API は状態を持たない（stateless）。** `currentProject` のような選択状態を持たず、常に `projectId` を渡す。
この規律が、同期・AI・積算・ポータルすべての土台を単純に保つ。

---

## 1. 全体像

```
                     甍AI Platform
        ┌───────────────────────────────┐
        │           Sync Layer          │   ← Phase 3（Firestore / Supabase）
        │        （全端末で同じ案件）      │
        └───────────────┬───────────────┘
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
   Iraka Field                     Iraka Estimation
  （現場・報告）                      （積算OS・Phase 4）
        │                               │
        └───────────────┬───────────────┘
                        ▼
                  Project Layer
             （案件＝唯一の真実 / SSOT）
```

レイヤー依存（下が土台、上は下だけに依存する）:

```
db.js
  ↓
project-api / report-api / photo-api / (estimation-api …)
  ↓
field-api（オーケストレーター・将来）
  ↓
HTML（projects / project / report / recovery / portal …）
```

同じ階層の API どうしは直接依存しない（親の存在確認など読み取りは可）。束ねるのは field-api。

---

## 2. データ基盤（db.js）

- DB名: `irakafieldDB`
- DB Version: **3**（v2: 初期スキーマ / v3: `projects.kind` インデックス追加）
- ストア: `projects` / `reports` / `photos` / `settings`
- マイグレーションは登録簿方式。`MIGRATIONS[n]` を足すだけで版を上げる（既存版は不変）。
- db.js は「保存・取得・削除・一覧・トランザクション」だけを担い、帳票の中身は解釈しない。

### 11の原則

1. `reports` に写真本体を持たせない（写真は `photos` に独立）
2. 全帳票に `schemaVersion` を持たせる
3. `projectId` で案件と帳票を紐づける
4. 写真は `reportId` と `projectId` に紐づける
5. Ver.1 下書きの自動移行はしない
6. 将来拡張は `extensions` / `metadata` で受ける
7. **Project を唯一の真実（SSOT）とする。全機能は案件に属する**
8. **API は状態を持たない（stateless）**。`currentProject` を保持せず、常に `projectId` を渡す
9. **Recovery が PASS しない限り、新機能はマージしない**（品質ゲート）
10. **Backward Compatibility First** — 既存現場を壊さない。新実装は旧システムの運用を止めてはならず、移行期間中は必ず共存する
11. **SelfTest と Recovery は同じ API を使う** — SelfTest は `IrakaRecovery` を直接叩く。テスト専用の別実装を作らない（テストは緑なのに本物は壊れている、を防ぐ）

---

## 3. 案件（project-api.js / IrakaProject）

レコード:
```
{ id:"proj_xxxxxxxx", name, customer, address,
  status, kind, createdAt, updatedAt,
  extensions:{ previousStatus?, estimationRef?, drawings?, … } }
```

- status: `active`（施工中）→ `completed`（完成）→〔OB管理〕→ `archived`（アーカイブ）
  - `archive()` は直前状態を `extensions.previousStatus` に退避、`unarchive()` で復元。
- kind: `housing / factory / public / roof / inspection / other`（アイコン・検索・分岐キー）
- 将来の積算・図面連携は `extensions` に足すだけ（案件コアは固定しない）。

---

## 4. 帳票（report-api.js / IrakaReport）

レコード:
```
{ id:"rep_xxxxxxxx", projectId, type, title, schemaVersion,
  data:{}, sourceReportId, createdAt, updatedAt,
  metadata:{ pageCount, photoCount, completed } }
```

- type: `amamori`（雨漏り調査）/ `completion`（工事完了）
- `data` の中身は解釈しない（各帳票に委譲）。**画像本体（Blob/DataURL/base64）は拒否**（原則1の防波堤）。
- `metadata` は一覧表示用（帳票を開かずに「写真18枚・未完成」を出す）。report-api が最小フィールドを保証。
- `copyFrom()` は `sourceReportId` を保持。`overrides.projectId` で別案件へも複製（テンプレート利用）。
- 一覧は作成日時の昇順＝時系列（案件画面の縦リストにそのまま載る）。

---

## 5. Ver.1 連携（report-bridge.js）— 非破壊

- Ver.1 の `index.html` は**1行も書き換えない**。末尾に script を足すだけ。
- `?projectId=` が付いたときだけ、Ver.1 の保存経路（`saveDraftById`→`setDrafts`）を薄くラップし、
  裏で report-api にもミラー保存。無ければ従来通り localStorage 単体で動作。
- 写真本体は Ver.1 の MediaManager（別 IndexedDB）に残し、report にはメタと参照のみ。

---

## 6. データ安全（最優先要件）— recovery.html / recovery-core.js / irbk.js

**「便利」より「絶対に失わない」を最優先。**

- 画面順は **①診断 → ②バックアップ → ③検証 → ④復元**（破壊的な復元は最後）。
- バックアップは **`.irbk`（ZIP・写真は `media/` に分離）** と JSON の両対応。ZIP は依存ゼロで自前実装（オフライン可）。
- 検証（整合性）は読み取り専用。孤立データは**自動削除しない** —— CSV書き出し / 別案件へ移動 / 削除（二重確認・最終手段）。
- `.irbk` は端末間の手動同期にも使える（Phase 3 の本格同期までの橋渡し）。

機能フラグは `config.js`（`window.IrakaConfig`）に集約: `REPORT_READY` / `PHOTO_READY` / `AI_READY` / `ESTIMATION_READY`。

---

## 6.5 開発フロー（安全ゲート）

新機能は「動く」だけでは出さない。**Recovery セルフテストが PASS してから**確定する。

```
新機能 完成
   ↓
recovery-selftest.html（PASS ×3）
   ↓
別PC / USB 復元 PASS（節目のみ）
   ↓
GitHub push → タグ
   ↓
次の開発へ
```

SelfTest は開発用の使い捨てではなく、**製品の一部（tools）**として同梱する。

---

## 7. ロードマップ

| Phase | 内容 | 状態 |
|------|------|------|
| 1 | 安全基盤（Project API / Report API / Recovery / .irbk / Bridge） | ✅ 完了 |
| 2 | 写真（Photo API：photos ストアの正式API） | 次 |
| 2.5 | **移行（Migration）**：MediaManager → photos へ移送 → 検証 → MediaManager 廃止。完了後に PHOTO_READY=true | 独立フェーズ |
| 3 | 同期（Sync API → Firestore or Supabase・全社員が同じ案件を見る） | 早める |
| 4 | 積算OS復活（Iraka Estimation → `project.extensions.estimationRef` で接続） | |
| 5 | 社内ポータル（`portal.html` ＝ 会社の入口。現場・積算・工程・資料・AI を統合） | |


> **なぜ Migration を独立フェーズにするか**: 同期(Phase 3)が始まると Ver.1写真と Ver.2写真の混在が致命傷になり得る。写真の一本化(2.5)を終えてから同期に進む。

---

## 8. リポジトリ構成（現時点）

```
iraka-report/
├ index.html            Ver.1 雨漏り調査（+ Ver.2連携script。本体は非改変）
├ projects.html         案件一覧（検索/フィルタ/新規） + 🩺データ診断リンク
├ project.html          案件ハブ（帳票の縦リスト・状態遷移・編集/削除）
├ recovery.html         データ診断・バックアップ・検証・復元
└ js/
   ├ config.js          機能フラグ（IrakaConfig）
   ├ db.js              IndexedDB 基盤（IrakaDB）
   ├ project-api.js     案件API（IrakaProject）
   ├ report-api.js      帳票API（IrakaReport）
   ├ report-bridge.js   Ver.1連携（IrakaBridge）
   ├ recovery-core.js   データ安全ロジック（IrakaRecovery）
   ├ irbk.js            依存ゼロZIP（IrakaIrbk）
   └ media-manager.js   （既存 Ver.1）
```

読み込み順: `config.js → db.js → project-api.js → report-api.js →（report-bridge / recovery-core / irbk）`

> デプロイ時は sw.js（Service Worker）のキャッシュ名を上げること（新 js を確実に読み込ませる）。

---

## 9. リリースタグ（進化の履歴）

```
v2.0-constitution   → 設計思想の確定（原則1〜11）
v2.0-safe-foundation → 安全に現場投入できる土台（Recovery / .irbk / SelfTest）
v2.0-complete       → Field 基盤の完成（Project / Report / Photo / Recovery）
v3.0-sync           → 同期（SyncProvider → Firestore / Supabase）
v4.0-estimation     → 積算OS接続（project.extensions.estimationRef）
v5.0-platform       → 社内ポータル統合（portal.html）
```

`v2.x` は Field 基盤、`v3.0` 以降は基盤の上に乗る機能。
リリース手順は `docs/RELEASE_CHECKLIST.md` を参照（憲法＝何を守るか / チェックリスト＝どう守るか）。
