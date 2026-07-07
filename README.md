# 甍AI積算エンジン Ver.3.1

> 住宅板金・雨樋工事積算OS（Iraka Knowledge OS）

## 📐 アーキテクチャ仕様書（憲法）
新機能を実装する前に必ず読むこと: [ARCHITECTURE.md](./ARCHITECTURE.md)
（Drawing → View → Calibration → Annotation → Geometry → Engine → Assembly → Estimate Mapping → Estimate のレイヤー構造と、各機能がどのレイヤーに属するかを定義）

## 設計思想

```
AIは積算を行うのではなく、積算理由を構築する。
積算結果が違っても構わない。根拠が違うことが問題である。
```

## アーキテクチャ

```
Knowledge → Engine → Reasoning → HumanCorrection → Learning → Output
```

### Knowledge層（/knowledge）
- `rules/`            — 全29ルール（RULE-001〜RULE-901）
- `makers/`           — Panasonic排水表・I-ROOF換気表・Assembly仕様
- `cases/`            — ProjectCard（案件単位の全情報）
- `component_history/` — 部材単位の採用履歴・統計
- `detail_history/`   — 納まり単位（部材×現場条件）の知識DB
- `manufacturer_history/` — メーカー仕様変更履歴
- `evidence_templates/` — Evidence雛形・実例
- `testcases/`        — Case001〜005テストケースJSON
- `KNOWLEDGE_INDEX.json` — 全体MAP

### Engine層（/src）
| ファイル | 責務 |
|---|---|
| `knowledge.js`          | KnowledgeJSON読込・勾配伸び率表 |
| `detectRoofType.js`     | 切妻/片流れ/寄棟判定 |
| `calcRoofArea.js`       | 投影面積×伸び率（RULE-001,100） |
| `calcLengths.js`        | 立面図実長（RULE-002,003,007,900,901） |
| `calcVentilation.js`    | 天井面積÷容量（RULE-004,005,201,202） |
| `calcDrainage.js`       | 投影面積÷69㎡（RULE-006,300） |
| `calcValley.js`         | 谷専用伸び率（RULE-120） |
| `calcValleyAssembly.js` | Valley Assembly（RULE-121〜124） |
| `generateEvidence.js`   | Evidence4層構造+HumanCorrection（Ver.3.1） |
| `assembly/BaseAssembly.js`    | Assembly基底クラス |
| `assembly/assemblyFactory.js` | 全10種Assembly Factory |
| `index.js`              | `IrakaEstimation()` メイン |

## テスト実行

```bash
npm test              # 全テスト（124テスト・RULE-601）
npm run test:main     # Case001/004/005
npm run test:valley   # RULE-120 谷板金
npm run test:assembly # Valley Assembly
npm run test:factory  # 全10種Assembly
npm run test:evidence # Evidence4層構造+HumanCorrection
```

## Evidence 4層構造

```
Observation  → 図面の何を見たか・どの面の部材か
Reasoning    → なぜそのRuleを選んだか（selectedRule/rejectedRules）
Calculation  → 数値計算（aiValueを常に保存）
Evidence     → 確定値・確信度・人確認
```

## 知識の粒度階層

```
会社 → 案件(ProjectCard) → 部材(ComponentHistory)
     → 納まり(DetailHistory) → ルール(Rules) → 根拠(Evidence)
```

## バイブル参照

甍AI積算 開発バイブル Ver.3.0（第25〜36章）  
追補第31-32章: 赤ペンPDF設計原則（RULE-410〜416）  
追補第33-36章: 住宅板金積算OSアーキテクチャ宣言
