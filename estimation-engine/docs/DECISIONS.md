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

## 2026-07-25 — 甍AI の中核技術は Recognizer。Compiler は「十分」＝これ以上育てない
- Reason: 7棟の実見積(cases.json)を並べて確信。Compiler は5計算モデルが同一契約に収束＝証明済み。Program も実データが入り始めた（単価はほぼ一定で確度高）。いま最大の価値／技術課題は「図面から、その Program へ渡す数量をどう作るか」＝Recognizer。甍AI の定義を「屋根・雨樋の積算AI」→「**建築図面を理解し数量を導く Recognizer**」に更新。
- Alternatives: 引き続き Compiler / 抽象化を育てる。
- Rejected because: Compiler は完成。抽象化を増やしても現場価値は増えない。図面→数量が通らない限り、どんな Compiler も机上のまま。

## 2026-07-25 — Phase 2 を「Programs」から「Recognizer」へリネーム
- Reason: Phase 2 の重心は「Program を磨く」より「図面理解を作る」。Program の実データ化は始まっており、Program改善の自動化は Phase 3（AIがProgramを育てる）へ送る。Project doc は `PHASE2-PROGRAMS.md` → `PHASE2-RECOGNIZER.md`。
- Alternatives: Phase 2 = Programs のまま、Recognizer は一機能として内包。
- Rejected because: 名前が優先順位を決める。「Recognizer が Phase 2」と明言しないと、また Compiler/抽象化に手が戻る。Program 作業は消えず Phase 2 内・Phase 3 で継続。

## 2026-07-25 — cases.json は Program Validation 兼 Recognizer の評価データ（アクセプタンス・ゲート）
- Reason: `図面 → Recognizer → 数量` を cases.json の数量と突き合わせれば、Recognizer の精度を客観測定できる。7棟で v1.0 の達成判定と精度測定に十分。
- Alternatives: cases.json を Program(単価/歩掛)の検証専用に閉じる。
- Rejected because: 同じ7棟が「入力(図面, project内)＋出力(数量, cases.json)」の対になっており、Recognizer の答え合わせに直結。ただし現状は最終数量のみ＝訓練データではなくアクセプタンス・ゲート。中間正解（数量の拾い根拠）は積算資料PDF(画像・未数値化)にあり、その数値化が図面→Geometry の教師を完成させる＝次の恒久抽出ターゲット。

## 2026-07-25 — 取引先ごとに Program。Recognizer(数量)は全社共通。WITH DOM saitama ＝ Program #1
- Reason: Recognizer が出すのは建物の事実（面積・役割別エッジ長・本数）＝取引先に依存しない。取引先ごとに変わるのは Program（商品＋単価＋拾いルール）だけ。∴ 構造は「1 Recognizer × N Programs（取引先ごと）」。cases.json の7棟は最初の取引先 WITH DOM saitama のパターン＝Program #1。まずこの1社を固め、数量が拾えたら2社目以降は商品表(Program)を足すだけで広がる。
- Alternatives: 取引先ごとに Recognizer/積算ロジックを分ける。最初から複数取引先を並行で作る。
- Rejected because: Recognizer を分けると価値が分散し、投資回収が1社に閉じる。数量は全社共通なので Recognizer は1本で足りる。並行着手は #1 が固まる前に拡散する。まず WITH DOM で「図面→数量→答え合わせ」を一周させるのが最速で全社に効く。「Compiler は取引先中立／変わるのは Program だけ」の実地証明でもある。

## 2026-07-25 — 甍AI の定義（確定版・一文）／Recognizer は主役でなくパイプラインの一部
> 甍AIは、建築図面から「建物の事実（Geometry・Quantity）」を抽出し、それを取引先ごとの Program へ適用して積算を生成するシステムである。
- Reason: この一文に 図面理解・数量抽出・Program・取引先ごとの差し替え が全部入り、将来の伏図生成/排水経路生成/換気棟計算 を足しても定義を変えずに済む。「Recognizer」は技術名（開発者の言葉）で、プロジェクトの目的＝屋根・雨樋積算OS の主役ではない。上記2件（『中核技術は Recognizer』『Phase2をRecognizerへ』）を**精緻化・上書き**する。
- Alternatives: 「甍AI＝Recognizer」を看板に据え続ける。
- Rejected because: 技術名を目的に昇格させると視野が図面認識に狭まる。目的は「事実を抽出→Programで積算」という OS。Recognizer はその入口の一部。

## 2026-07-25 — Phase 2 ＝ Drawing Intelligence（図面理解）。Recognizer はその構成要素
- Reason: Phase 2 の器を「Recognizer」より広い **Drawing Intelligence** にする。中に Recognizer / Geometry生成 / Quantity抽出 が入り、将来の 屋根伏図生成 / 排水経路生成 / 換気棟配置 も同じ器に収まる。Project doc は `PHASE2-RECOGNIZER.md` → `PHASE2-DRAWING-INTELLIGENCE.md`。
- Alternatives: Phase 2 = Recognizer のまま個別機能を積む。
- Rejected because: 器が狭いと伏図・排水経路・換気棟が「別物」に見えてしまう。全部「図面から事実を作る」で一貫させる。

## 2026-07-25 — 資産は Quantity（建物の事実）。ただし保存する正は Geometry(Model)
- Reason: 数量は一度だけ拾い、その1つの Quantity から WITH DOM向け／他社向け／メーカーA・B仕様… を何通りでも生成できる（商品・単価は変わっても 軒先37.4m・谷8.2m・面積143.77㎡ は不変）。∴ 甍AIが作る資産＝Quantity＝クライアント中立の分岐点(fork)。分岐キーは取引先でも販売ルートでもメーカー仕様でもよい（＝『Program は甍の積算ルール、メーカーそのものではない』と一致）。
- Alternatives: Quantity を保存の正にする。
- Rejected because: Quantity を保存すると今日の taxonomy で凍結（将来の伏図・排水経路は数量一覧でなく「形」から引く）。Geometry(Model) を保存すれば今 taxonomy に無い数量も後から derive できる。Evidence First と矛盾せず両立：**保存＝Geometry、資産(fork)＝Quantity(その Projection)**。「一度だけ拾う」の“一度”を支えるのが Geometry。実装も `Geometry → roof/drainQuantities(=Quantity) → Material IR＋Program → 積算`。
