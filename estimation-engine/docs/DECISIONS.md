# DECISIONS — 設計判断の記録（ADR-lite）

> Git は「何が変わったか」、CHANGELOG は「Program をなぜ変えたか」、
> **DECISIONS は「設計をなぜこうしたか」** を残す。ADR ほど重くせず「なぜ」だけを1件ずつ。
> 迷ったら、まずここを読む。「なんで別リポジトリじゃないんだっけ？」に一発で答えるための場所。

## フォーマット
```
## YYYY-MM-DD — <決定>
- Reason: <なぜ>
- Alternatives: <他に検討した案>
- Rejected because: <却下理由>
```

---

## 2026-07-25 — 積算は iraka-report の中へ（新リポジトリを作らない）
- Reason: 案件が本体・積算は Module。iraka-report は毎日運用中の業務OS（案件/PDF/写真/IndexedDB/PWA）で、その上に載せるのが「案件中心」設計。社員は迷わない・データ一元化・保守/配布が一つ。
- Alternatives: 別リポジトリ（iraka-estimation-os を独立で育てる）。
- Rejected because: 社内運用が分断される。教育・更新・PWA・DB が二重になる。

## 2026-07-25 — エンジンは estimation-engine/ サブディレクトリに「ソースごと」入れる
- Reason: Source→Test→Build→Artifact の鎖を Git に残す＝再現性。`npm test && npm run build:estimation` で estimation.html を再生成できる。
- Alternatives: 成果物(estimation.html)だけコミット。
- Rejected because: 半年後「何から生成したか」不明になり保守が切れる。実際、再現ビルド中に String.replace の `$` バグをコミット前に検知できた（成果物だけなら後から追う羽目に）。

## 2026-07-25 — Bridge を先に作る（パリティ調査は後）＝ Platform → Program → Retirement
- Reason: 案件⇄積算の接続が無いと、Compiler が完成していても現場で使えない。パリティ(谷樋/換気棟/ケラバ)は Program Validation そのもの＝Phase2 本体。
- Alternatives: 先に旧v3.1との機能パリティを100%確認してから接続。
- Rejected because: 「置き換え」発想。旧エンジンは過去資産であって設計上の親ではない。実案件を流してから差分を Evidence で見る方が価値が高い。

## 2026-07-25 — Compiler は Execution で終わる／Cost 等は Domain Compiler（アルゴリズム中立）
- Reason: 5つの異なる計算（Reduction/Graph+CPM/Rule Engine/多段集約/職種集約）が同一契約 `DomainCompiler<Program,IR>` に例外なく収束＝契約は境界だけを縛る。
- Alternatives: 各ドメインに専用の型/境界を持たせる。共通 DecisionIR 型を導入する。
- Rejected because: 5つ目(Resource)が特別扱いを要求しなかった＝一般化済み。共通 IR 型は構造が違い型安全を生まない。

## 2026-07-25 — Knowledge は IR でなく Program（ただし今はリネームしない）
- Reason: `Execution + Program → Domain IR`。歩掛/単価/順序/原単位/検査基準は Compiler を構成する規則。
- Alternatives: 今すぐ `knowledge/` → `programs/` にリネーム。
- Rejected because: 影響 > メリット。呼称は Knowledge のまま、意味を Program と理解すれば足りる。実値投入時に版付けする。

## 2026-07-25 — Export は作らない ＝ Presentation Adapter
- Reason: 帳票(Excel/PDF/API)は Domain IR を表示へ写すだけ。旧 ExportResult/Adapter の直観は正しかったが、読む対象を Domain IR（evidence 付き）に上げた。
- Alternatives: 独立した Export 機能を作る。
- Rejected because: Domain IR を読むだけの Adapter で足りる。IR を変えない・1 IR→複数 Adapter。

## 2026-07-25 — Program Compiler（二階建て）は今 LOCK しない
- Reason: Program 自体の自動生成（実績/カタログ/AI→Program）は自然だが、まず人が Program を十分磨いた後に価値が出る。
- Alternatives: 今から二階建てを設計に入れる。
- Rejected because: 未実証の抽象化を増やす。現契約「Program は外から与えられる」で十分（Phase 3〜4 で扱う）。

## 2026-07-25 — Program ＝ 甍の積算知識（Iraka Program）。メーカー名の Program とは呼ばない
- Reason: このプロジェクトは甍の屋根・雨樋積算エンジン。Compiler は共通で、変わるのは Program だけ。Program は「甍がそのメーカー製品をどう施工・積算するか」。
- Alternatives: 「Panasonic Program / LIXIL Program」とメーカー単位で呼ぶ。
- Rejected because: 甍AIが扱うのはメーカーそのものでなく甍の積算ロジック。メーカー仕様は Program の知識源の一つ。呼称は一貫して Iraka Program。

## 2026-07-25 — 甍AI は「図面理解AI」。積算はその最初の成果物
- Reason: ユーザーの本当の要求は「図面を入れてボタンを押すと積算が出る」。核心は図面を理解する能力で、屋根/雨樋積算・排水経路・伏図・換気棟は全部その上に載る。
- Alternatives: 「積算ソフト」として個別機能を積む。
- Rejected because: 図面理解を核に据えると全機能が同じ土台で一貫する。Phase 1 の Compiler は「図面理解の後(Geometry→Estimate)」の半分＝AI認識結果を信頼できる積算に変える下半分。Recognizer(図面→Geometry IR/Model)が新しい入口で、既存パイプラインにそのまま繋がる。
