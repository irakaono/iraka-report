# 甍AI Release Checklist

> 憲法（CONSTITUTION.md）＝**何を守るか**。このチェックリスト＝**どう守るか**。
> 原則(9)「Recovery が PASS しない限り、新機能はマージしない」を、毎回この手順で担保する。

---

## 毎リリース（必須）

- [ ] **Recovery SelfTest PASS ×3**（`recovery-selftest.html` の「▶▶ 3回連続」が緑）
- [ ] **.irbk バックアップ作成成功**（`recovery.html` ②で書き出し・サイズ確認）
- [ ] **Migration 確認**（DB Version を上げた場合。旧版DBから開いて既存データ保持を確認：v2→v3 等）
- [ ] **診断が正常**（`recovery.html` ①で各ストア件数・下書きが期待どおり）
- [ ] **Git Tag を打つ**
- [ ] **Release Notes を書く**（変更点・移行注意・タグ名）
- [ ] **sw.js のキャッシュ名を更新**（新 js を確実に配信）

## 節目リリースのみ（基盤が変わったとき）

- [ ] **USB（別PC）復元成功**（PC①で.irbk → USB → PC②で復元 → `projects.html` で全件見える）
- [ ] **PWA 再インストール確認**（ホーム画面アイコンから開いて正常）

---

## タグ規約（履歴で進化が一目で分かるように）

```
v2.0-constitution     … 設計思想の確定（原則1〜11）
      ↓
v2.0-safe-foundation  … 安全に現場投入できる土台（Recovery / .irbk / SelfTest）
      ↓
v2.0-complete         … Field 基盤の完成（Project / Report / Photo / Recovery）
      ↓
v3.0-sync             … 同期（SyncProvider → Firestore / Supabase）
      ↓
v4.0-estimation       … 積算OS接続（project.extensions.estimationRef）
      ↓
v5.0-platform         … 社内ポータル統合（portal.html）
```

- `v2.x` は Field 基盤。`v3.0` 以降は基盤の上に乗る機能。
- 破壊的でない機能追加は `v2.0-complete` 以降、`vX.Y` の Y を上げる。

---

## リリース手順（例）

```
# 1. セルフテスト（実機ブラウザ）
open recovery-selftest.html → PASS ×3

# 2. バックアップ
recovery.html → ②.irbk 保存

# 3. コミット & タグ
git add -A
git commit -m "<変更内容>"
git tag -a <tag> -m "<説明>"
git push origin main --tags
```
