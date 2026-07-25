# validation — 甍 実案件 見積データセット

`cases.json` は甍(WITHDOM Saitama)の**実案件の見積書(屋根工事・雨樋工事)から抽出した実データ**。
2つの役割を持つ:

1. **Program Validation（答え合わせ）** — エンジンが Geometry → Execution → Domain Compiler で出した積算を、この実見積と突き合わせて精度を測る。
2. **Iraka Program の実値源** — 歩掛・単価・部材構成の「甍の実際の値」。`knowledge/material/*.json` の例示値を実値へ寄せる根拠。

## 中身
- 7棟 × (屋根 / 雨樋) = 14見積、112行。税込総額 ¥10,198,804。
- 各行: `name / qty / unit / unitPrice / amount / note`。各見積: `subtotal / tax / total`。
- 金額・端数は**原本の記載値を保持**（`fukubori/gutter` の消費税表示に原本由来の1円差あり→`sourceNote`）。

## 出所と限界
- 出所: Project「甍AI」保存の見積PDF（テキスト層）。
- **数量の根拠は未収録**: 面積・長さの拾い元（積算資料・図面）は画像PDFのため、qty がどの図面計測から来たかは別途トレースが必要。
- つまり現状は「**入力(図面)は未数値化・出力(見積)は数値化済**」。Recognizer が図面→数量を出せるようになったら、この qty が答えになる。

## 検証
```bash
node -e 'const d=require("./cases.json");/* 行合計=小計, 合計=小計+税(原本注記除く) を確認 */'
```
全ケース整合を確認済み（行合計=小計、合計差は原本注記のみ）。

## 更新の流儀
実データを足す/直すときは原本の値を尊重し、丸めや不整合は「直さず注記」。答え合わせの基準がブレると Validation の意味が消える。
