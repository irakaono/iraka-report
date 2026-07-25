# 甍AI Estimation OS

> **甍AI Estimation OS は、数量を自動で出すAIではない。**
> **積算という「判断」を記録し、理解し、再利用するためのOSである。**

この一文が、このリポジトリのすべての土台になる。
迷ったときは、必ずここに戻る。

---

## 1. これは何か

積算ソフトではない。積算ソフトは「数量」と「金額」を出す。
Estimation OS が残すのは、その手前にある **人の判断** である。

```
図面
  ↓
何を見たか      （Recognizer）
  ↓
何を判断したか   （Roof Engine / Operation）
  ↓
どう計算したか   （Estimate Engine）
  ↓
見積            （Converter）
```

普通の積算ソフトは最後の「見積」だけを残す。
Estimation OS は、**その見積に至るまでの判断の連なり**を丸ごと残す。

なぜか。積算とは、ベテランの頭の中で起きている判断だからだ。
「この屋根はこう見る」「この納まりならこの数量」「この客ならこの単価」——
それは今、人が辞めれば消える。図面と見積書だけが残り、判断は残らない。

Estimation OS は、その判断を **記録し（Record）**、**理解し（Understand）**、**再利用する（Reuse）** ための器である。

「共有」ではなく「理解」を柱に置く。共有は手段にすぎない。
本当にやりたいのは、積算という判断を **後から誰でも理解できる状態にする**ことである。
理解できて初めて、その判断は再利用できる資産になる。

---

## 2. 位置づけ — Field の子ではない

以前は「Field の中の積算機能」だった。今は違う。

```
              甍AI Platform
                   │
             Project（SSOT）
                   │
          ┌────────┴────────┐
      Field OS        Estimation OS
          ▲                 ▲
          └───────AI────────┘
              （横断レイヤー）
```

**Project（案件）だけが唯一の真実（Single Source of Truth）である。**
Field OS と Estimation OS は、その周りに立つ **兄弟** であり、上下関係はない。

**AI は兄弟ではない。** AI は独立した OS ではなく、両 OS を **横断するレイヤー**として、
それぞれの OS の中で働く。Field の中にも、Estimation の中にも AI はいる。
だから「AI OS」という箱は作らない。AI は場所ではなく、各所に宿る能力である。

Estimation OS は Project を **読むだけ**である。書き換えない。
自分の成果物は自分のストアに持ち、Project からは `extensions.estimation` を通して参照される。

```
Project
├ reports        （Field が書く）
├ photos         （Field が書く）
├ estimation     （Estimation が参照キーを置くだけ / 本体は別ストア）
├ schedule
├ documents
└ AI
```

Project がハブ。Estimation は `Project.extensions.estimation` を読むだけ。
Project コアには一切触れない。これが **Stateless** の意味であり、Field 憲法の原則8をそのまま継承する。

---

## 3. 目指す一本道

案件を軸に、すべてが一本につながる。

```
案件
 ↓
図面
 ↓
積算
 ↓
見積
 ↓
施工
 ↓
報告書
```

Estimation OS が担うのは「図面 → 積算 → 見積」の区間。
その前後（案件・施工・報告書）は Field と Project が担う。
API だけで繋ぐ。互いの内部には踏み込まない。

---

## 4. 何を最初に作るか

コードではない。**理念と設計**を先に固める。

1. `README.md` — 理念・目的（このファイル）
2. `ARCHITECTURE.md` — 全体設計（Recognizer → … → Converter と Knowledge）
3. `CONSTITUTION.md` — Field 憲法から継承した Estimation の原則

この3つが固まれば、その後 Recognizer や Roof Engine を数万行書いても、
「何を作るべきか」がぶれない。ここが本当のスタートラインである。

---

## 5. 憲法の継承

Estimation OS は Field 憲法（原則1〜11）を **親憲法**として継承する。

```
Field Constitution（原則 1〜11）
        │
        └── Estimation Constitution（継承 + 積算向け補足）
```

SSOT・Stateless・Backward Compatibility・品質ゲート（Recovery が PASS しなければマージしない）は、
Estimation OS でもそのまま生きる。詳細は `CONSTITUTION.md` を参照。

---

## 6. リポジトリ構成（これから）

```
iraka-estimation-os/
├ README.md         理念・目的（本ファイル）
├ ARCHITECTURE.md   全体設計
├ CONSTITUTION.md   Field から継承した原則
└ （以降、実装が進むにつれて）
   ├ recognizer/    図面から「何を見たか」を起こす
   ├ roof-engine/   屋根の判断
   ├ operation/     積算操作の記録
   ├ estimate/      計算
   ├ converter/     見積への変換
   └ knowledge/     判断の拠り所（コードではなく資産）
      ├ material/   材料・部材
      ├ rule/       歩掛・単価・区分の規則
      ├ geometry/   形状・納まりのパターン
      ├ operation/  拾い方・数え方
      └ history/    判断の履歴（Decision History。案件集ではない）
```

> `knowledge/` はコードではない。人が編集し、LLM が読む **会社の資産**である（憲法 原則17）。

---

甍AI Platform の一部。案件（Project）を唯一の真実とし、
積算という判断を、会社の資産として残していく。

**人が辞めても、判断は辞めない。**
**会社は、人ではなく判断を育てる。**
**甍AI Estimation OS は、そのための基盤である。**
