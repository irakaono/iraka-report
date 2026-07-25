# PROGRAMS — 甍の積算知識（Iraka Program）

> **Phase 2 の原則：これ以降の改善対象は Compiler ではなく Program。**
> **Program ＝ 甍の積算知識**（甍が屋根・雨樋をどう施工・積算するか）。
> メーカー仕様（Panasonic/セキスイ/デンカ…）は Program を構成する**知識源の一つ**であって、中心は常に甍の積算ロジック。

## 呼称（このプロジェクトの定義）
- ✅ **Iraka Program**（甍の積算知識）と呼ぶ。
- ❌ 「Panasonic Program」「LIXIL Program」とは呼ばない。甍AIが扱うのは*メーカーそのもの*ではなく、*甍がそのメーカー製品をどう拾うか*。
- 例：Panasonic PC50 の雨樋を使う案件でも、重要なのは `Geometry → Execution → 甍の積算ルール → 必要部材`。メーカーカタログをそのまま Program にするのではない。

## Program に入るもの（甍の積算ノウハウ）
```
Geometry → Execution → Iraka Program（下記）→ Estimate
   ・Panasonic 雨樋の部材構成      ・タニタハゼの拾い方
   ・棟換気の数量算出              ・谷樋の歩掛
   ・雪止め配置                    ・役物の数量
   ・標準ロス率                    ・SKU / 部材の組み合わせ / 標準施工
```

## いま Program はどこにあるか（`knowledge/material/*.json`・例示）
| ファイル | 役割 | 中身（甍の積算知識） |
|---|---|---|
| `intent.json` | Material IR | 数量key→施工意図＋既定属性 |
| `products.panasonic.json` | Procurement | 意図→製品（甍が Panasonic 雨樋をどの品番で拾うか。★例示） |
| `assembly.json` | Execution | 付属展開（でんでん/ジョイント/接着剤/ビス。★例示歩掛） |
| `prices.example.json` / `cost.example.json` | Cost | 単価 / 労務単価・経費率・歩掛（★例示） |
| `schedule.example.json` | Schedule | 工数・施工順序（★例示） |
| `qa.example.json` / `carbon.example.json` / `resource.example.json` | QA/Carbon/Resource | 検査規則 / CO₂原単位 / 職種・班（★例示） |

**★例示＝仕組みの実証用。実値は Phase 2 で甍の実データから確定する。**

## 将来の整理（実 Program が増えたら）
甍の積算知識が育つと、屋根/雨樋の実態に沿ってこう分ける想定（今はリネームしない）:
```
knowledge/
  roof/      standing_seam.json / asphalt_shingle.json / tile.json
  gutter/    panasonic.json / sekisui.json / denka.json   ← 甍がそのメーカー雨樋をどう拾うか
  flashing/  役物・板金納まり
  labor/     歩掛
  materials/ SKU・部材構成
```
※ メーカー名のファイルは「メーカーの Program」ではなく「甍がそのメーカー製品を拾う知識」。

## Program を追加/変更する手順（Compiler に触れない）
```bash
# 1. 該当 JSON を編集（歩掛を実測へ / 新しい屋根材・雨樋製品を追加 / 納まりを追加）
npm test                     # 契約が壊れていないか
npm run build:estimation     # → ../estimation.html を再生成
# 2. docs/CHANGELOG.md に「何を・なぜ・Evidence」を記録
```
Compiler（`src/geometry/*Compiler.ts`）は編集しない。**JSON を替えるだけ**で積算が変わる。

## Phase 2 = 甍の積算知識を育てる
- 実案件で歩掛を補正 / 谷樋の拾い漏れをなくす / 棟換気ルールを改善 / 新しい屋根材・雨樋製品へ対応 / 新しい納まりを追加。
- 一次資料は既に社内：`iraka-report/knowledge/`（manufacturer_history / component_history / detail_history / ProjectCard）。
- AI の役割（Phase 3）：メーカーを学習するのではなく、**甍の積算知識を育てる**（実績→歩掛分析→更新案→承認→採用）。
