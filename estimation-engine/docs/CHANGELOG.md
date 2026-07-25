# CHANGELOG — Program 変更履歴（人間が読む形）

> Git にも残るが、**Program の変更は「何を・なぜ・Evidence」を人間の言葉で残す**。
> 数年後の保守で「この歩掛はなぜこの値か」を追えることが、精度と信頼の土台になる。
> 対象は Program（`knowledge/material/*.json`）の変更。Compiler(`src/`)の変更は Git ログ側で追う。

## 記入フォーマット
```
## YYYY-MM-DD — <対象 Program> <一言>
- 変更: <どのファイルの何を、どう変えたか>
- 理由: <なぜ（メーカー基準改訂 / 実測 / 法改正 / 現場フィードバック 等）>
- Evidence: <根拠（施工実績N棟 / カタログ版 / 通達番号 等）>
- 影響: <どの Domain の出力が変わるか（Compiler は不変）>
- 承認: <確認者>
```

## 記入例（フォーマットの見本・未反映）
```
## 2026-08-01 — Panasonic IR-380 歩掛変更
- 変更: cost.example.json / schedule.example.json の Panasonic IR-380 系 歩掛を更新
- 理由: メーカー施工基準改訂
- Evidence: 施工実績23棟の実測
- 影響: 見積(Cost)・工程(Schedule)。Compiler は不変
- 承認: 小野
```

---

## 2026-07-25 — v0.5.0 初期 Program（例示・実値未確定）
- 変更: 全 Program を初期投入（`intent / products.panasonic / assembly / prices.example / cost.example / schedule.example / qa.example / carbon.example / resource.example`）。
- 理由: 5ドメイン（Cost/Schedule/QA/Carbon/Resource）で Compiler 契約を実証するための最小 Program。
- Evidence: なし（★例示値。歩掛/単価/順序/CO₂原単位/検査基準は現場基準ではない）。
- 影響: 全 Domain の出力は「仕組みの実証」レベル。実務精度は未担保。
- 次: Phase 2 で `iraka-report/knowledge/`（Panasonic/IROOF/部材履歴/ProjectCard）と実測から実値へ確定（Program Validation）。実値化した項目を本ファイルに追記していく。
