# 雨漏り調査OS フィクスチャ（Regression Fixture / Canonical Modeling Case）

> 正の設計文書：`claude/LEAK-INVESTIGATION-OS.md`（Architecture = FROZEN）
> このフォルダは **Phase 0：Fixture Export** の受け皿。
> ADR §7 の順序「**フィクスチャ確保 → 決定の文書化 → 印刷改善**」の一段目。

## なぜフィクスチャを「ファイルに」出すのか

雨漏り調査報告書（`index.html`）の下書きは **ブラウザの localStorage / IndexedDB** に入る。
これはブラウザを消す・端末を替える・キャッシュを飛ばすと **失われる揮発領域**。

ADR は「**唯一の取り返しのつかない項目＝フィクスチャ4件を失わないこと**」と書いている。
だから4件を **1つの自己完結 JSON ファイル**（写真も base64 で同梱）としてここに固定し、Git で残す。

## 4件（ADR §6 Canonical Modeling Cases）

| ファイル名（推奨） | 案件 | 実態 | 役割 |
|---|---|---|---|
| `01-nire.iraka-leak.json`   | 仁礼 | 初回調査・**Round1 のみ** | 最小形（単一Round） |
| `02-ishii.iraka-leak.json`  | 石井 | 雨漏り**2系統** ＋ 雨樋の**付随所見** | 複数Hypothesis＋incidentalFinding |
| `03-lining.iraka-leak.json` | ライニング | 地点**11箇所** | 多地点（source→destination 多数） |
| `04-irushi.iraka-leak.json` | 入吉 | 雨漏り**3** ＋ 水漏れ**1** | 複数Hypothesis（Canonical Case #4） |

> 注（ADR §6）：この分類は Ground Truth ではない。フィクスチャの目的は **実案件を固定すること**。
> Hypothesis の切り方はデータモデル検証時に見直してよい。

## 書き出し手順（小野さん・実データの固定）

実データは各案件を入力したブラウザの中にしかない。次の手順でこのフォルダへ出す：

1. `index.html`（雨漏り調査報告書）を、その案件が入っている端末／ブラウザで開く
2. ツールバー **「📋 下書き管理」** を開く
3. 対象案件の行の **「⬇ 書き出し」** を押す → `fixture-<名前>-<日付>.iraka-leak.json` がダウンロードされる
4. 上表の推奨ファイル名にリネームして、この `fixtures/` に置き、commit する

読み戻す／別端末へ移すときは、下書き管理の **「⬆ 読み込み」** からファイルを選ぶ（新しい下書きとして復元。既存は上書きしない）。

## この4件は何に使うか（次の一手）

ADR Decision #4：印刷改善 第1弾＝「**空欄を印刷しない**」バッチ。
空欄を消すと高さ・改ページ位置が動くため、**この4件を Regression Acceptance の網にして
PASS を確認してから**入れる。実装は5分でも、検証にはフィクスチャが要る。
**フィクスチャ無しでは着手しない**（＝このフォルダが4件で埋まるまで印刷改善は始めない）。

## ファイル形式（`*.iraka-leak.json`）

```jsonc
{
  "format": "iraka-leak-report-fixture",
  "version": 1,
  "exportedAt": "ISO8601",
  "appCacheName": "iraka-field-vX.Y.Z",   // 書き出した時のアプリ版
  "draft": { "name": "...", "updatedAt": "ISO8601", "data": { /* collectReportData の出力 */ } },
  "photos": [ { "key": "blk-3-img:thumb", "type": "image/jpeg", "dataUrl": "data:..." } ]
}
```

- `photos[].key` は `photo:<draftId>:` を外した **draftId 非依存の相対キー**。読み込み時に新しい draftId で再キーされる。
- 写真は thumb / full の両方が入る（印刷品質の再現に必要）。
