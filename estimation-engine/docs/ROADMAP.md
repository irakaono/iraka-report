# ROADMAP — 甍AI（v0.5.0 以降の旗）

> 設計はクローズ。ここに書くのは「設計」ではなく **どこがゴールか**。
> 判断に迷ったら「これは v1.0 に必要か？」をこの旗に照らす。

## 成熟度（2026-07-25 時点）
| 領域 | 状態 |
|---|---|
| Project（案件） | ✅ 完成 |
| Persistence（保存） | ✅ 完成 |
| Geometry Runtime | ✅ 完成 |
| Building Compiler | ✅ 完成 |
| Domain Compiler（5種） | ✅ 完成 |
| Program Framework | ✅ 完成 |
| Program Validation | 🔜 これから |
| PDF → Geometry | 🔜 これから |
| Presentation Adapter（見積書） | 🔜 これから |

→ **残るは「設計」ではなく「機能」と「実証」**。

## Phase 1 — Architecture Validation ✅（CLOSED）
5つの異なる計算モデルが同一契約に収束＝アーキテクチャを証明した。詳細 `ARCHITECTURE.md`。

## Phase 2 — Reality Validation（現在地）
> **Goal: A real project can be completed from drawing to estimate inside Iraka AI.**
> （1件の実案件を、甍AIだけで最後まで完了できることを証明する）

### Definition of Done（これが全部通れば Phase 2 成功）
- [ ] 実案件を1件登録できる
- [ ] PDF図面を読み込める
- [ ] Geometry を作成できる
- [ ] Execution を生成できる
- [ ] Domain IR を生成できる
- [ ] Program で積算できる
- [ ] 案件へ保存できる
- [ ] 翌日に再開できる
- [ ] 見積書を出力できる

（今日すでに通るのは Geometry〔手描き〕→Execution→Estimate→保存→翌日再開。残りは PDF読込 と 見積書 Adapter。）

## v1.0 の定義（旗・実装はまだ）
> **v1.0 = 実案件1棟を、図面から見積書まで甍AIだけで完結できた最初のリリース。**
- **線引き**：v1.0 は「**一度**、実案件1棟が最後まで通った」で達成。毎日の堅牢性・複数棟スケール・多メーカー Program は **v1.x** へ回す。これで v1.0 は到達可能なまま、スコープが膨らまない。
- 位置づけ：v1.0 ＝ 甍AI の最初の正式版。**v0.5.0 ＝ その土台（業務OSへの移行を完了したマイルストーン）**。

## Phase 3 — Program Improvement（見えている先）
Compiler は触らない。育てるのは Program だけ。
```
過去300棟 → 歩掛分析 → Program更新案 → CHANGELOG生成 → 承認 → Program採用
```
- Panasonic / LIXIL / KMEW / IG / 甍標準 … の Program 更新・歩掛補正・実測差分・施工会社別 Program。
- **AI の役割 = Compiler を書くのではなく Program を育てる**（更新案＋Evidence＋CHANGELOG 生成 → 人が承認）。今回の設計思想と完全に一致。
