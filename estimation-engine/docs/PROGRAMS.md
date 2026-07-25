# PROGRAMS — 甍AI の Program（Compiler ではなく、これを育てる）

> **Phase 2 の原則：これ以降の改善対象は Compiler ではなく Program。**
> Compiler は完成・凍結。価値はもう「賢いコンパイラ」ではなく「**良い Program**」にある。

## Program とは（Knowledge は第5の IR ではない）
IR は**データ**（Geometry / Material / Execution / Domain）。一方 Program は **Compiler を構成する規則**（`if / rule / coefficient / constraint / formula`）。
```
Execution + Program → Domain Compiler → Domain IR
```
同じ Compiler に別の Program を差すと別の結果が出る。`甍標準 / Panasonic / LIXIL / IG / KMEW …` はすべて **Program**（同じ Compiler の利用者）。今後増えるのは Compiler ではなく Program。

## どこにあるか（`knowledge/material/*.json`）
| ファイル | ドメイン | 中身（Program） |
|---|---|---|
| `intent.json` | Material IR | 数量key→施工意図(kind)＋既定属性（taxonomy） |
| `products.panasonic.json` | Procurement | Intent→Product（maker/series/sku。★例示） |
| `assembly.json` | Execution | 付属展開（でんでん=ピッチ / ジョイント=定尺 / ビス=依存。★例示歩掛） |
| `prices.example.json` | Cost | sku→単価（★例示） |
| `cost.example.json` | Cost | 労務単価・経費率・歩掛（★例示） |
| `schedule.example.json` | Schedule | 工数原単位・施工順序制約（★例示） |
| `qa.example.json` | QA | 検査規則（metric×op×threshold。★例示） |
| `carbon.example.json` | Carbon | CO₂原単位・輸送率（★例示） |
| `resource.example.json` | Resource | 職種・班編成・機材（★例示） |

**★例示 = 仕組みの実証用。実値は Phase 2 で甍の実データから確定する（Program Validation）。**

## Program を追加/変更する手順（Compiler に触れない）
```bash
# 1. 該当 JSON を編集（例: cost.example.json の歩掛を実測へ）
# 2. テスト（契約が壊れていないか）
npm test
# 3. 成果物を再生成
npm run build:estimation      # → ../estimation.html
# 4. docs/CHANGELOG.md に「何を・なぜ・Evidence」を記録（人間が読む形）
```
Compiler（`src/geometry/*Compiler.ts`）は編集しない。**JSON を替えるだけ**で見積/工程/CO₂ が変わる。これが「アルゴリズム中立」の実利。

## メーカー別 Program（将来）
```
knowledge/material/
  programs/            ← 将来（今はリネームしない）
    cost/koizumi-2026.json
    cost/panasonic-2026.json
    schedule/...
```
※ 命名/バージョン管理（会社・版・有効期日・出典）は「抽象化」ではなく**データ管理**。今は例示ファイルのまま、実値投入時に版付けする。

## 実 Program の一次資料は既に社内にある
`iraka-report/knowledge/`（manufacturer_history: Panasonic/IROOF、component_history: Valley380/NF-I、detail_history、cases: ProjectCard）は**既に Program Repository**。例示値をここから実値へ確定させるのが Phase 2 の中心作業。

## Program Compiler（二階建て）は今 LOCK しない
将来 `Rule Sources（Excel/PDF/AI/法改正/実績/カタログ）→ Program Compiler → Program` が現れ得るが、**まず人が Program を十分磨いた後**（Phase 3〜4）。現契約は「Program は外から与えられる」で十分。
