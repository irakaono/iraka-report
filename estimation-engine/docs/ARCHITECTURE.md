# 甍AI Estimation Engine — ARCHITECTURE（正・Phase 1 CLOSED / 2026-07-25）

> このエンジンは「積算ソフト」ではなく **建築ドメインの汎用コンパイラ基盤**。
> 屋根伏図（Geometry）から、見積・発注・工程・品質・CO₂・体制まで、**1本の Compiler パイプライン**で派生させる。
> Phase 1（アーキテクチャ）は CLOSED。**これ以降の改善対象は Compiler ではなく Program**（`PROGRAMS.md` / `CHANGELOG.md`）。

## パイプライン（4つの IR）
```
Reality（図面/入力）
  │  Construction Compiler
  ▼
Geometry IR ─[Material IR]─ Execution IR ═╤═[Domain Compiler + Program]═ Domain IR ─[Presentation Adapter]─ Excel/PDF/API/UI
  幾何(Vertex/Edge/Face/Graph)  意図/製品   実行計画(施工の唯一の真実)      見積/工程/CO₂/品質/体制      表示
```
- **Geometry IR**：屋根モデル（faces）＋雨樋（Node/Edge Graph）。保存する唯一のもの（幾何＋属性）。
- **Material IR（第1境界）**：施工意図(Intent)。製品名を知らない（`vertical_drain 60φ`）。製品は Rule Engine が解決。
- **Execution IR（第2境界）**：実行計画（操作＋主部材＋付属）。**Compiler の終点・Canonical だが派生・保存しない**。
- **Domain IR**：業務ドメインの中間言語（Estimate / TaskGraph / Inspection / Carbon / Resource）。→ Presentation Adapter で帳票へ。

## 核心原則（LOCK）
1. **Evidence First**：保存は幾何＋属性(Model)だけ。数量/意図/製品/実行計画/見積/工程…は毎回派生。evidence が4 IR を貫通（見積1行・ビス1本・工程1タスク・CO₂1行が Segment まで遡れる）。
2. **Execution は Compiler of Compilers の要**：建築 Compiler の出力であり、各業務 Compiler（Cost/Schedule/QA/Carbon/Resource）の入力。
3. **契約はアルゴリズム中立**：`DomainCompiler<Program, IR>` は境界だけを縛る。中身は Reduction / Graph+CPM / Rule Engine / 多段集約 / 職種集約 と自由。5ドメインで実証済み。
4. **Domain は足すが Construction は足さない**：各 Domain Compiler が注入するのは Program（単価/歩掛/順序/原単位/検査基準）だけ。「何を施工するか」は Execution の専権。
5. **Knowledge は IR でなく Program**（`Execution + Program → Domain IR`）。差し替えで結果が変わり Execution は不変。
6. **Export は存在しない ＝ Presentation Adapter**。Domain IR は表示技術に依存しない。Adapter は IR を変えない（読むだけ・1 IR → 複数 Adapter）。
7. **エルボは Graph 由来 → 付属展開しない**（二重計上回避）。付属(でんでん/ジョイント/接着剤/ビス)は Graph に無い消耗品だけ。

## ソース地図（`src/geometry/`）
```
roofModel/roofEngine/roofQuantities/roofDrawing            屋根 Geometry→数量→伏図
drainModel/drainCommands/drainQuantities/drainDrawing/drainValidator/validation/history   雨樋 Runtime
persistence.ts   Model⇔JSON（保存は Model だけ。iraka-report の bridge が入出力に使う接続点）
materialIntent / productCatalog / materialCatalog          第1境界（Intent）＋ Rule Engine（Procurement）
executionModel   Execution（終点・Canonical・付属展開 basis）
projection.ts    純Projection（bomProjection＝発注 Identity）
costCompiler / scheduleCompiler / qaCompiler / carbonCompiler / resourceCompiler   5 Domain Compiler
domainCompiler   一般契約 DomainCompiler<K,IR> / IdentityCompiler / PresentationAdapter
presentation.ts  Presentation Adapter 6種（estimate/order/taskGraph/inspection/carbon/resource）
knowledge/material/*.json   Program（例示・実値は Phase 2 で確定）→ PROGRAMS.md
components/RoofStudio.tsx    Studio（薄い UI 層）。iraka-report 埋め込み時は window.IrakaEstimationHost 経由で案件へ保存/復元。
```

## iraka-report との接続（甍AI Field の1機能として）
- **案件が本体・積算は Module**。`estimation.html?projectId=proj_xxxx` で案件に紐付く。
- 保存は `js/estimation-bridge.js` が担う（Model JSON を `estimations` ストア＋`project.extensions.estimationRef`）。**エンジンは IndexedDB を知らない**（純ランタイム）。
- ビルド：`npm run build:estimation` → `../estimation.html`（`scripts/build-estimation.mjs`）。
- 詳細は Project docs（`claude/IRAKA_ARCHITECTURE.md` / `MATERIAL_IR` / `EXECUTION_MODEL` / `DOMAIN_COMPILERS` / `DOMAIN_IR` / `PHASE2-PROGRAMS`）。

## テスト（品質ゲート）
`npm test` ＝ 18スイート（geometry/roof/drain/engineBoundary/persistence/materialAdapter/execution/assembly/cost/presentation/schedule/qaCarbon/resource…）。`npx tsc --noEmit` 型0。**全緑でないものはビルド/コミットしない。**
