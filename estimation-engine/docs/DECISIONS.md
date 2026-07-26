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

## 2026-07-25 — 雨樋検証＝Drawing Intelligence の最初の Acceptance（雨樋エンジンの検証ではない）
- Reason: 雨樋は `Quantity→Program→見積` が単純なので、図面→Geometry→Quantity を純粋に測れる。ゴール＝「図面から生成した Geometry が cases.json と一致する Quantity を導けることを証明する」。測定ラダー L0図面が読める / L1 Geometry(正解Geometryが無いので辺内訳ログで診断) / L2 Quantity(合格=max(±0.1m,±1%)、自動化目標±20mm) / L3 Program=cases.json と100%一致。各段でΔを残す。詳細は Project doc `claude/ACCEPTANCE-drawing-intelligence.md`。
- Alternatives: 合計 Quantity だけ見て合否。トレランスを一律 ±20mm。
- Rejected because: 合計だけだと「どの辺を間違えたか」が追えず教師データにもならない→辺ごと内訳ログ(edgeId/role/length/total)をロック。cases.json は0.1m丸め＝精度上限0.1m、手トレース＋raster図面で±20mmは非現実的→トレランスは2段階(手トレース期 max(±0.1m,1%) / 自動化期 目標±20mm)。前提：スケール較正(px→m を既知寸法2点で確定)が隠れたL0.5で必須。L3にはWITH DOM雨樋Program(単価はcases.jsonに既存)の実配線が要る。この局面のΔは主に人トレース精度＝将来Recognizerを同じハーネスで差し替えて測るためのベースライン。
- 上位原則（ロック）: **Acceptance の閾値は Ground Truth(cases.json)の測定粒度を超えてはならない。** 今の Δ には〔人トレース＋較正＋raster解像度＋0.1m丸め〕が混在し、±20mmを合否にすると Drawing Intelligence の良否と測定系の良否を分離できない。より高精度なGround Truth(レーザースキャン/CAD/BIM)が入れば閾値を自然に tightening する。Phase A=max(±0.1m,±1%) を正式Acceptanceにロック、Phase B(Recognizer)で±20mmへ引き締め。

## 2026-07-25 — Recognizer(Phase B) は水上で Human Provider が L0〜L3 ALL PASS するまで開始しない（ゲート・ロック）
- Reason: これを守ると不具合の切り分けが混ざらない（Recognizer / Geometry / Quantity / Program のどこが原因か）。今 PASSしているのは `Ground Truth→Engine→PASS`（＝決定的な下半分・acceptance.test）だけ。`図面→Human Trace→Geometry→Quantity→Program→PASS` を最後まで通すまで Drawing Intelligence は完成ではない。マイルストーン名：**Phase A = Human Provider（水上 ALL PASS で ✓ Completed）→ Phase B = Recognizer Provider**。
- 実走で見るのは3つだけ：① 較正（0.91m→px/m が正しく決まるか）② Geometry（Debugger の edge/role/length で role間違い・閉じ忘れ・取りこぼしを見る）③ Δ（L2/L3 PASS）。
- ★重要な運用ルール：実走で PASS しなくても **Geometry を数字合わせで修正しない**。「なぜ PASS しなかったか」を Debugger で見る（そのために Acceptance Panel がある）。Geometry Runtime / Quantity Runtime / Program Runtime を分離した設計を守る。
- Alternatives: Recognizer と Human Provider を並行で進める／実走前に機能追加を続ける。
- Rejected because: 並行だと原因が混ざる。今は機能追加でなく「Human Provider の Acceptance を100%通す」が最優先。ここを通せば Recognizer は Geometry Provider を差し替えるだけの開発になる。

## 2026-07-25 — Verification 運用（4点ロック）：Acceptance Panel は「測定器」
- ① **失敗も成果として保存する**：Run(#NNN) を PASS/FAIL 問わず残す（case・L0〜L3・Reason・内訳）。修正後の Run も残し `Failure→Cause→Fix→PASS` の履歴にする。Recognizer 導入後は `Human 98% / Recognizer 95% / v2 99%` の比較土台になる。
- ② **Debugger は UI でなく測定器**：PASS表示よりも「**なぜFAILしたか**」が主役。この思想を最後まで崩さない。
- ③ **見る順番を固定**：L0→L0.5→L1→L2→L3。**前段が FAIL なら後段は SKIP**（L2赤ならProgramを見ない／L1赤ならQuantityを見ない）。切り分け時間が激減。
- ④ **Human Provider 完了条件（1行）**：「同一案件を何度トレースしても L0〜L3 が**再現性をもって**PASS することをもって完了とする」。一度PASSでなく、やり直しても・別日でも・操作者が変わっても大きく崩れない、まで確認。
- Reason: 評価系が壊れないための運用規約。②③は診断の速さと正しさ、①④は Recognizer(Phase B) を同じ物差しで測るための土台。
- Alternatives: PASSだけ記録／一度PASSで完了とする。
- Rejected because: 失敗を捨てると Cause→Fix の学習が消える。一度PASSは再現性を保証しない（操作依存の偶然PASSを完了と誤認する）。

## 2026-07-25 — Baseline（標準器）を固定する／Phase A の成果物＝「Human Baseline v1.0 LOCKED」
- Reason: 案件×Provider×更新(Program/Geometry/Calibration) で Run が増えると「どの Run を基準に比較するか」が必ず崩れる。そこで **Baseline を LOCK**（例: `mizukami / Human / Run#018 / LOCKED`）＝これが真実。以後は `Recognizer v1 → Baseline との Diff` だけ見る。Verification は3層 `Baseline → Run → Diff` になり、Diff だけで原因が分かる。Provider思想と一致：Human で Baseline を作り、Recognizer/Program更新は**同じ不変の Baseline** に対してのみ比較＝比較対象が永遠に変わらない。
- ★v1.0 の定義（更新）：**「Human Baseline v1.0 が LOCKED された瞬間」＝ Drawing Intelligence が本当の意味で Version 1.0**。単なる「一度PASS」でも「Human Provider Completed」でもなく、水上で**再現性をもって**ALL PASS した Run を標準器として固定できた時。
- 実装上の切り分け：Baseline Diff は **数量/role 層では即安定**（軒樋長・集水器数…）。**辺ごと Diff は Provider 間で edge id が不一致**のため辺対応付け（role＋位置順）が要る＝後段課題。辺内訳は Baseline に記録して参照に残す。
- Alternatives: 常に cases.json を基準にする／Baseline を持たず最新 Run 同士で比較。
- Rejected because: cases.json は最終数量(aggregate)のみで辺分解を持たない＝Baseline の方が診断が細かい。最新同士比較は基準が動いて回帰を検出できない。

## 2026-07-25 — Baseline は IMMUTABLE（不変）。改善は上書きでなく新版を積む。Run に基準を埋め込む
- Reason: Baseline を後から更新すると**過去の評価が全部変わる**（例：2026年 Recognizer v1=98% が、2027年に Baseline を変えた瞬間 95% になる）＝測定器として致命的。∴ Baseline は **編集不可・修正不可・削除不可（IMMUTABLE）**。改善版は `Human Baseline v1.0` を書き換えず **`v1.1`** を新規作成、測定方法が大きく変われば **`v2.0`**。系譜 `v1.0→v1.1→v2.0` を積む。
- **Run に基準を埋め込む**：各 Run に `Compared Against: Human Baseline v1.0` を必ず保存。Baseline が増えても「その Run がどの標準器で評価されたか」は永久に失われない。
- **ADR 類似**：ADR は Decision を、Baseline は Measurement Truth を残す。役割は違うが「過去を書き換えず新版を積む」哲学は同じ。
- **Verification は4層**：**Baseline（何を真実とするか）→ Run（今回何を測ったか）→ Diff（どこが違ったか）→ Decision（どう判断したか）**。この4つで、数年後に Recognizer/Program が大きく進化しても「なぜ当時その評価だったか」を完全再現できる。
- **適用範囲**：Drawing Intelligence だけでなく KKai・今後の甍AI 全体に展開できる検証アーキテクチャ（汎用の測定基盤）。
- Alternatives: Baseline を可変にして常に最新へ更新／Run に基準を残さない。
- Rejected because: 可変 Baseline は過去評価を破壊し回帰・進歩の履歴が消える。基準未記録だと後年 Diff の意味が復元不能。

## 2026-07-25 — ゲート緩和（ユーザー判断）：自動提案(AI積算)を並行実装する
- Reason: 小野の判断で「Recognizer は水上 Human Baseline 固定まで開始しない」を緩和し、自動提案を**並行で今すぐ**実装する（`手拾い vs AI積算 → 採用` の比較ワークフローを回したい）。ただし原因の切り分けが濁らないよう **Acceptance/Baseline の規律は維持**：AI も同じ測定系(L0〜L3・Baseline との Diff)で評価し、手拾いと並べて表示する。
- 第一版 自動提案：雨樋を屋根 Geometry から決定的に提案（全軒に軒樋／各軒両端に集水器／各集水器から縦樋）＝`autoPropose.ts`。Recognizer(図面→Geometry 自動認識)ではなく「Geometry→雨樋の自動拾い」から。図面認識は段階的に。
- Alternatives: ゲート厳守（Human Baseline 固定まで自動提案を作らない）。
- Rejected because: ユーザーが比較ワークフローを優先。規律（同一Acceptanceで手拾いとAIを並べる）を保てば、切り分けの濁りは比較画面で可視化できる＝ゲートの意図は測定系で担保。

## 2026-07-25 — 甍AI Ver.1 ＝ 図面から会社の知識を育てる OS（アーキテクチャを一段上げる）
- Reason: 積算データを使い捨てでなく **案件(Project)の資産**として持つ。一本のデータ基盤 `Drawing→Geometry→Evidence→Quantity→[Human/AI/GT]→Decision→Learning→Export` で、採用・学習・帳票が同じ土台で動く。詳細は Project doc `claude/VER1-OS-ARCHITECTURE.md`。
- 既存の測定基盤 `Baseline→Run→Diff→Decision`（ロック済）と矛盾せず内包：Decision の下に **Evidence**（数量→辺内訳→図面ハイライトの一気通貫トレース＝Evidence First の UI 実体化）、上に **Learning**（Decision→AIの成功例/負例）が乗るだけ。
- Comparison は `Human/AI/GT` から **`Item×Human×AI×GT×Decision`（項目ごとの採用）** へ上げる。
- Alternatives: 積算をセッション限りのデータとして扱う／比較を全体一括の採用に留める。
- Rejected because: 案件資産化しないと履歴・学習・トレースが消える。項目ごとDecisionでないと「どの数量を誰の値で採ったか」と学習データが取れない。

## 2026-07-25 — Ver.1 最終形：Review と Knowledge(Project/Company) を正式追加してロック
- **Learning と Knowledge は別物**（最重要の分離）：Learning＝データ（AIが学ぶ材料。例 Edge023/Human5.42/AI5.01/Decision=Human）。Knowledge＝知識（会社の資産・蒸留/統計。例 寄棟でこの納まりは集水器角共有・採用率98%）。**AIが読むのは Knowledge**（Recognizer/積算AI/将来の見積AI 全部）。
- **Knowledge は二層**：Project Knowledge（この案件の学び）→ Company Knowledge（全案件の統計＝ノウハウ。例 住宅245件→寄棟118件→角共有91%）。全工種(外壁/基礎/木工事/設備/内装)へ広げてもアーキを作り直さない。
- **Review（承認履歴・必須）**：`Human/AI/GT → Review → Decision`。保存＝Reviewed By/日付/理由。「AIが出した」でなく「誰が承認したか」まで会社知識に残す。公共工事・住宅・AI高度化後も決定的。
- 最終フロー：`Drawing→Geometry→Evidence→Quantity→[Human/AI/GT]→Review→Decision→Knowledge{Project,Company}→Learning→Export`。同一データ基盤で「案件管理OS／会社知識OS／AI育成OS」の3つを実現。詳細 `claude/VER1-OS-ARCHITECTURE.md`。
- Alternatives: Learning と Knowledge を同一視／Review を挟まず AI/GT から直接 Decision。
- Rejected because: データと知識を混ぜると「AIが読むべき蒸留知識」と「学習素材」が分離できない。Review 無しだと承認責任の履歴が残らず、公共工事や監査で通らない。

## 2026-07-25 — ゴール＝Digital Twin（建物の一生を支えるOS）。「AI積算ソフト」ではない
- Reason: 甍AI の最終目標は **建築会社の知識と建物のライフサイクルを支える OS**。`図面→Geometry→屋根→雨樋→排水経路→材料→施工→実績→点検→修繕→次回積算`（建物の一生）。屋根伏図生成・雨樋経路計画・Excel・Knowledge・Learning・Recognizer は全部この一本の線へ向かう。詳細ロードマップは Project doc `claude/BACKLOG-yaritai.md`。
- ★価値の変曲点：一番価値があるのは屋根伏図生成そのものでなく**その次**＝`屋根伏図→AIが排水経路を書く→集水器位置→縦樋位置→排水能力計算→必要部材を全部拾う`＝**設計支援AI**（市場にほぼ無い領域）。
- フェーズ＝別プロジェクト：Ver.1 Excel/積算保存 → Ver.1.x 雨樋排水経路(AIが"考える"最初) → Ver.2 屋根伏図生成(図面生成AIの入口) → Ver.3 Company Knowledge → 最終 Digital Twin。
- Alternatives: 「AI積算ソフト」として機能を積む。
- Rejected because: 積算はライフサイクルの一断面。Digital Twin を北極星に置くと、既存の 案件→Geometry→Evidence→Provider→Review→Decision→Knowledge がそのまま一生の管理へ拡張でき、途中で設計を作り直さない。

## 2026-07-25 — 甍AI ＝ Building Intelligence Platform（共通エンジンは工種非依存）。Ver.4 に建物理解エンジンを明示
- Reason: エンジンは工種に依存しない。`Drawing→Geometry→Semantic Model→Engineering Rules→Simulation→Decision→Knowledge`。**屋根が最初の1工種・雨樋が2工種目**で、外壁/基礎/木工事/設備/太陽光/維持管理が**同じエンジン**に載る。既存実装がそのまま対応：Geometry IR＝Geometry、Material/Execution IR＝Semantic Model、Program/Domain Compiler＝Engineering Rules、排水能力等＝Simulation、Provider/Review/Decision/Knowledge＝そのまま。
- ロードマップに **Ver.4 Building Intelligence Engine** を Ver.3 と Ver.5(Digital Twin) の間に明示。これで Digital Twin が単なる3D・履歴でなく「**判断できる建物モデル**」になる。
- 差別化：他社は `CAD→積算` で終わる。甍AIは `図面→Geometry→Evidence→Engineering→Knowledge→Decision→建物の一生`＝図面を読むAIでなく**建物を理解して判断するAI**。詳細 `claude/BACKLOG-yaritai.md`。
- Alternatives: 雨樋専用エンジンとして最適化／Digital Twin を Ver.3 直後に置く。
- Rejected because: 工種専用化は再利用を捨てる。エンジン層(Ver.4)を明示せず Digital Twin へ飛ぶと「判断できるモデル」の土台が言語化されず、全工種展開時に作り直しを招く。

## 2026-07-25 — 「工種」でなく「Domain」。BIE＝Construction Domain の集合。Digital Twin＝BIE＋Project History
- Reason: 屋根/雨樋/外壁/基礎 は工種名でなく **Construction Domain**。各 Domain は Semantic Model＋Engineering Rules＋Simulation＋Program を持ち、**Domain Compiler** が `Semantic Model→Estimate/Construction/Simulation/Check` にコンパイルする。Program が増えても「Domain Compiler」1概念で統一（Domain追加＝Compiler追加、既存不変）。詳細 `claude/DOMAIN-ARCHITECTURE.md`。
- ★2層の整理：**Construction Domain**（Roof/Gutter/Wall…＝建物システム）と、既存の **Output Domain**（Cost/Schedule/QA/Carbon/Resource＝`DomainCompiler<Program,IR>`・横断出力投影）は段が違う。Construction が「何を作るか」、Output が「各帳票へ写す」。
- 既存が既に対応：Roof Domain＝roofModel/roofQuantities、Gutter Domain＝drainModel/drainQuantities。外壁/基礎…は同形で Domain を足すだけ（作り直し不要）。
- Digital Twin＝Geometry＋Domain Knowledge＋Engineering Rules＋History＝**BIE＋Project History**。役割分担：Ver.4 BIE＝頭脳（工学判断）、Ver.5 Digital Twin＝生きた建物（頭脳＋施工/点検/修繕の履歴）。
- Alternatives: 工種を単なるラベルとして扱う／RoofProgram等を個別概念のまま増やす。
- Rejected because: ラベル扱いだと Program の増加で構造が崩れる。Domain Compiler で統一すれば N ドメインでも一様。Digital Twin を BIE＋History と定義しないと「3Dモデル」に退化する。

## 2026-07-26 — 設計の背骨3原則を憲法に追加（19 Project=SSOT/Projection、20 Geometry Immutable、21 Recognizer=Provider）
- Reason: 「作る」より「育てる（案件・知識）を管理する」段階に入り、5年後も崩れない軸として3原則を CONSTITUTION 原則19〜21に明文化（Project doc `CONSTITUTION.md`）。
- **19 Project が器・Export は Projection**：Project(Drawings/Geometry/Estimations/Decisions/Knowledge/Reports/Photos/History) が唯一の真実。Excel/PDF/報告書/見積/Learning は保存対象でなく Project の **Projection（射影）**。「Export」でなく「Projection」と考える＝出口が増えても真実は増えない。
- **20 Geometry is Immutable, everything else is Projection**：`Geometry→Roof→Gutter→Estimate→Report→Excel` は全部 Projection。数字を直すのは「Excel修正」でなく「**Geometry修正**」。出力物を手で書き換えて正にしない（真実が二つになる）。既存の原則18(Canonical Result)を形状レイヤーへ一般化。
- **21 Recognizer は AI でなく Provider**：Human/AI/GT/Recognizer は**対等な Provider**（同じ入力契約で Measurement/Geometry まで作る）→ Review→Decision→Knowledge で一本化。Recognizer を特別扱いしない＝AIが賢くなってもアーキは一本のまま。
- 統一図：`Project → Providers(Human/AI/GT/Recognizer) → Geometry → Review → Decision → Knowledge → Projection(Excel/Report/PDF/Dashboard/API)`。重心は「AIを増やす」でなく「**Projectに集約**」。
- 実行順の確定（Project doc `claude/BACKLOG-yaritai.md`）：**Phase A**（案件Estimation履歴→採用版→Decision→Evidence）→ **Phase B** Recognizer（AIおすすめ縮尺→寸法線検出→屋根候補）→ **Phase C** 設計支援（排水経路→換気→屋根伏図）→ **Phase D** Knowledge→BIE→Digital Twin。理由：Recognizerは後から賢くできるが、**案件という器**が弱いと後続のAI/Knowledge/Decisionが積み上がらない。
- Ver.1 KPI：**「3分で見積」**（PDF投入→②縮尺30s→③屋根90s→④AI数量→⑤見積30s＝3分以内）を合格ライン兼・営業資料兼・社内目標に。
- Alternatives: Recognizer を特別な AI レイヤーとして設計／出力物(Excel)を編集して正とする／Recognizer を Phase A より先に着手。
- Rejected because: Recognizer特別扱いはAI強化のたびにアーキ改修を招く。出力編集を許すと真実が二重化しGeometry不変が崩れる。器(Project/Estimation履歴)未完のままRecognizerを積むと土台が後で崩れる。

## 2026-07-26 — Phase A #1「案件ごとの Estimation 履歴」：永続化契約を LOCK して実装（原則19の初実体化）
- **DB v5（追加のみ・原則5/10）**：`js/db.js` に 2 ストア追加。既存(projects/reports/photos/settings/estimations)は不変。
  - `geometryRevisions`：保存済み形状＝不変・追記のみ（原則20）。`{ id, projectId, sequence, schemaVersion, createdAt, model(=serializeDocument JSON・savedAt無し) }`。index: projectId/sequence/createdAt。
  - `estimationRevisions`：積算履歴 001/002…（原則12/19）。`{ id, projectId, sequence, schemaVersion, createdAt, createdBy, geometryRevisionId(＝形状を固定/pin), geometrySequence, quantitySnapshot, quotationSnapshot, status:'draft'|'reviewed'|'adopted'|'superseded', note }`。index: projectId/sequence/geometryRevisionId/createdAt。
- **採用版は Estimation でなく Project 側の Decision**（原則19・Phase A#2の受け皿）：`project.extensions.estimationDecision = { adoptedEstimationId, decidedBy, decidedAt, reason }`。bridge に get/setEstimationDecision を用意（UIは#2）。
- **current working state は従来の `estimations`（1件・上書き）を維持**＝後方互換。履歴は別ストアに追記。旧案件は履歴0件＝「未履歴化」、次の保存で Estimation-001 になる（遅延移行・強制変換なし）。
- **形状の複製をしない（原則20）**：saveEstimationRevision は直近 Geometry Revision と model 文字列が同一なら再利用（Estimation-002→Geometry-001 可）。ゆえに Revision には savedAt を含めない純粋形状を渡す（Studio 側で `serializeDocument(faces, dm)`）。
- **過去版を開く**＝当時の Geometry Revision を loadFromJson。数量・見積は Geometry からの決定的 Projection（原則20）なので snapshot は監査・再現確認用に併存。
- bridge API（`window.IrakaEstimationHost` / `window.IrakaEstimation`）：listRevisions / listGeometryRevisions / saveRevision / openRevision(=loadGeometryRevision) / get/setDecision。Studio は host.hasHistory の時だけ「🕘 履歴」を出す（standalone は非表示＝単体HTML保存経路は不変）。
- **自己テスト（原則11・本番APIを直接）**：headless(実IndexedDB)で DoD 実証＝001/002/003 追記／一覧／過去版を開く／保存済み不変／再読込でID・連番不変／同一形状は Geometry を複製しない／旧経路(standalone)不変。
- Alternatives: adopted を Estimation の可変属性にする／Geometry を各 Estimation へ丸ごと複製／履歴を project レコード内の配列で持つ。
- Rejected because: adopted を Estimation に持たせると採用の付け替えが履歴を汚す（Decisionは Project 側が自然）。形状の丸ごと複製はデータ膨張と同一性喪失。配列内包は原則1（本体と参照の分離）に反し肥大化する。
