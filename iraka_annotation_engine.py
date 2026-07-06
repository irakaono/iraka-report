"""
甍AI積算 AnnotationエンジンとPDF描画エンジン（RULE-410〜416準拠）
設計原則:
  数量計算  = Engine (calcRoofArea等)
  描画位置  = 人が拾った座標 (AnnotationJSON)
  根拠文章  = Evidence
"""
import fitz, json, math
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Optional, List, Tuple

JP = '/usr/share/fonts/truetype/fonts-japanese-gothic.ttf'

# ── RULE-400 カラー ──
COLORS = {
    "roof":   (0.753, 0.000, 0.000),  # 赤
    "gutter": (0.118, 0.459, 0.714),  # 青
    "vent":   (0.165, 0.380, 0.098),  # 緑
    "drain":  (0.361, 0.176, 0.569),  # 紫
    "alert":  (0.773, 0.353, 0.067),  # 橙
    "ok":     (0.137, 0.537, 0.329),  # OK緑
    "ng":     (0.753, 0.000, 0.000),  # NG赤
    "gold":   (0.612, 0.396, 0.000),  # 金
    "white":  (1.0, 1.0, 1.0),
}
CARD_W = 78
CARD_H = 68

# ══════════════════════════════════════════════
# Annotation データクラス（RULE-412）
# ══════════════════════════════════════════════
@dataclass
class Coord:
    x: float
    y: float

@dataclass
class Annotation:
    id: str
    ann_type: str              # 'line' | 'point' | 'polygon'
    layer: str                 # 'roof' | 'gutter' | 'vent' | 'drain'
    page_no: int
    # 座標（人が確定した値。RULE-411: 変更禁止）
    start: Optional[Coord] = None    # line
    end:   Optional[Coord] = None    # line
    point: Optional[Coord] = None    # point
    polygon: List[Coord]  = field(default_factory=list)  # polygon
    # 描画スタイル
    width: float = 2.0
    # Engine連携
    rule_refs: List[str]   = field(default_factory=list)
    evidence_id: str       = ""
    quantity: float        = 0.0
    unit: str              = ""
    label: str             = ""
    # カード配置
    card_auto: bool        = True
    card_x: float          = 0.0
    card_y: float          = 0.0
    # メタ
    created_by: str        = ""
    confirmed: bool        = False

    @property
    def color(self):
        return COLORS.get(self.layer, COLORS["gold"])

    @property
    def anchor(self) -> Coord:
        if self.point: return self.point
        if self.start: return self.start
        if self.polygon: return self.polygon[0]
        return Coord(0, 0)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["color"] = f"#{int(self.color[0]*255):02X}{int(self.color[1]*255):02X}{int(self.color[2]*255):02X}"
        return d


# ══════════════════════════════════════════════
# Evidence カードデータ
# ══════════════════════════════════════════════
@dataclass
class EvidenceCard:
    title: str
    rows: List[Tuple[str, str]]  # (テキスト, 色キー)
    status: str                  # "OK" | "NG" | "要確認"
    rule_id: str
    confidence: int
    reasoning_summary: str = ""  # ReasoningTraceの要約


# ══════════════════════════════════════════════
# カード位置の余白探索（RULE-413）
# ══════════════════════════════════════════════
def find_card_position(
    anchor: Coord,
    page_w: float, page_h: float,
    existing: List[Tuple[float, float]],
    card_w: float = CARD_W, card_h: float = CARD_H
) -> Tuple[float, float]:
    """余白を探してカード位置を決定。AIが求める唯一の座標計算。"""
    margin = 8.0
    offsets = [
        (-card_w - margin,  -card_h / 2),   # 左
        (margin,             -card_h / 2),   # 右
        (-card_w - margin,  -card_h - margin), # 左上
        (margin,            -card_h - margin), # 右上
        (-card_w / 2,       -card_h - margin), # 上
        (-card_w / 2,        margin),           # 下
        (-card_w - margin,   margin),           # 左下
        (margin,             margin),            # 右下
    ]
    for dx, dy in offsets:
        cx = anchor.x + dx
        cy = anchor.y + dy
        # ページ内
        if cx < 5 or cy < 5: continue
        if cx + card_w > page_w - 5: continue
        if cy + card_h > page_h - 5: continue
        # 既存カードと重なり検査
        overlap = any(
            abs(ex - cx) < card_w and abs(ey - cy) < card_h
            for ex, ey in existing
        )
        if not overlap:
            return cx, cy
    # 全て埋まったら右端に縦積み
    used_ys = sorted(y for x, y in existing if x > page_w * 0.7)
    next_y = (used_ys[-1] + card_h + 4) if used_ys else 30.0
    return page_w - card_w - 5, min(next_y, page_h - card_h - 5)


# ══════════════════════════════════════════════
# PDF描画ペン
# ══════════════════════════════════════════════
class Pen:
    def __init__(self, page):
        self.p = page

    def line(self, x1,y1,x2,y2, col, w=1.5):
        s=self.p.new_shape(); s.draw_line(fitz.Point(x1,y1),fitz.Point(x2,y2))
        s.finish(color=col,width=w); s.commit()

    def rect(self, x1,y1,x2,y2, col, fill=None, w=1.0):
        s=self.p.new_shape(); s.draw_rect(fitz.Rect(x1,y1,x2,y2))
        s.finish(color=col,fill=fill,width=w); s.commit()

    def circle(self, cx,cy,r, col, fill=None, w=1.2):
        s=self.p.new_shape(); s.draw_circle(fitz.Point(cx,cy),r)
        s.finish(color=col,fill=fill or COLORS["white"],width=w); s.commit()

    def poly(self, pts, col, fill=None, w=1.0):
        s=self.p.new_shape(); s.draw_polyline([fitz.Point(pt.x,pt.y) for pt in pts])
        s.finish(color=col,fill=fill,width=w,closePath=True); s.commit()

    def t(self, x,y,txt,col,sz=4.5):
        self.p.insert_text(fitz.Point(x,y),txt,fontsize=sz,color=col,fontfile=JP,fontname='jpgoth')

    def leader(self, x1,y1,x2,y2, col, w=0.8):
        """L字引き出し線"""
        mx = x2
        self.line(x1,y1,mx,y1,col,w)
        self.line(mx,y1,x2,y2,col,w)
        # 始点マーカー
        s=self.p.new_shape(); s.draw_circle(fitz.Point(x1,y1),1.8)
        s.finish(color=col,fill=col,width=0.3); s.commit()


# ══════════════════════════════════════════════
# 根拠カード描画
# ══════════════════════════════════════════════
def draw_card(pen: Pen, x: float, y: float, card: EvidenceCard,
              layer: str, w: float = CARD_W):
    col    = COLORS[layer]
    col_ok = COLORS["ok"]
    col_ng = COLORS["ng"]
    line_h = 7.0
    n      = len(card.rows)
    h_body = n * line_h
    h_foot = 20.0
    h_head = 11.0
    total  = h_head + h_body + h_foot

    # 外枠
    pen.rect(x,y, x+w, y+total, col, (0.97,0.97,1.0), 1.2)
    # ヘッダー
    pen.rect(x,y, x+w, y+h_head, col, col, 0)
    pen.t(x+3, y+8, f'■ {card.title}', COLORS["white"], 5.0)

    # 計算行
    gy = y + h_head + 6.5
    for txt, col_key in card.rows:
        pen.t(x+4, gy, txt, COLORS.get(col_key, (0.1,0.1,0.1)), 4.8)
        gy += line_h

    # 判定
    sep_y = y + h_head + h_body + 2
    pen.line(x, sep_y, x+w, sep_y, col, 0.4)

    ok  = card.status == "OK"
    btn_w = w / 2 - 3
    if ok:
        pen.rect(x+2, sep_y+2, x+2+btn_w, sep_y+9, col_ok, (0.88,1.0,0.93), 0.8)
        pen.t(x+5, sep_y+7.5, '✓ OK', col_ok, 5.0)
    else:
        pen.rect(x+2, sep_y+2, x+2+btn_w, sep_y+9, col_ng, (1.0,0.88,0.88), 0.8)
        pen.t(x+4, sep_y+7.5, f'✗ {card.status}', col_ng, 4.5)

    # Confidenceバー
    bar_w = w - 6
    bar_y = sep_y + 12
    pen.rect(x+3, bar_y, x+3+bar_w, bar_y+2.5, (0.8,0.8,0.8), (0.9,0.9,0.9), 0.3)
    fill_col = col_ok if card.confidence >= 80 else COLORS["alert"]
    pen.rect(x+3, bar_y, x+3+bar_w*card.confidence/100, bar_y+2.5,
             fill_col, fill_col, 0)

    # RuleID + Confidence
    conf_col = col_ok if card.confidence >= 80 else COLORS["alert"]
    pen.t(x+3, sep_y+18,
          f'{card.rule_id}  Conf.{card.confidence}%',
          conf_col, 3.8)


# ══════════════════════════════════════════════
# メイン描画関数（RULE-410〜416準拠）
# ══════════════════════════════════════════════
def render_annotations_to_pdf(
    src_pdf: str,
    annotations: List[Annotation],
    evidence_cards: dict,   # {evidence_id: EvidenceCard}
    out_pdf: str
):
    """
    AnnotationJSONの座標をそのままPDFに描画する。
    座標の再計算は一切しない（RULE-411）。
    """
    doc  = fitz.open(src_pdf)
    existing_cards: dict = {}  # {page_no: [(x,y)]}

    for ann in annotations:
        page = doc[ann.page_no]
        pen  = Pen(page)
        col  = ann.color
        pw, ph = page.rect.width, page.rect.height

        # ① 図面上の描画（RULE-411: 座標はAnnotationJSONから）
        if ann.ann_type == "line" and ann.start and ann.end:
            pen.line(ann.start.x, ann.start.y,
                     ann.end.x,   ann.end.y, col, ann.width)

        elif ann.ann_type == "point" and ann.point:
            pen.circle(ann.point.x, ann.point.y,
                       5.5, col, _tint(col, 0.85))
            # ラベル（小さい文字）
            pen.t(ann.point.x+6, ann.point.y+2,
                  ann.label[:2], col, 4.5)

        elif ann.ann_type == "polygon" and ann.polygon:
            pen.poly(ann.polygon, col, _tint(col, 0.92))

        # ② カード位置決定（RULE-413: 余白探索のみAIが行う）
        if ann.card_auto:
            existing = existing_cards.get(ann.page_no, [])
            cx, cy = find_card_position(ann.anchor, pw, ph, existing)
            existing_cards.setdefault(ann.page_no, []).append((cx, cy))
        else:
            cx, cy = ann.card_x, ann.card_y

        # ③ 引き出し線
        anchor = ann.anchor
        pen.leader(anchor.x, anchor.y, cx + CARD_W/2, cy + 10, col, 0.7)

        # ④ 根拠カード（Evidenceから生成）
        ev_card = evidence_cards.get(ann.evidence_id)
        if ev_card:
            draw_card(pen, cx, cy, ev_card, ann.layer, CARD_W)

    doc.save(out_pdf)
    print(f"  → {out_pdf}")


def _tint(col, alpha):
    """色を薄くする"""
    return tuple(1 - (1-c)*(1-alpha) for c in col)


# ══════════════════════════════════════════════
# AnnotationJSON ← → Python変換
# ══════════════════════════════════════════════
def load_annotations(json_path: str) -> List[Annotation]:
    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)
    return [_dict_to_annotation(a) for a in data["annotations"]]

def save_annotations(annotations: List[Annotation], json_path: str,
                     project_id: str = "", pdf_path: str = ""):
    data = {
        "projectId": project_id,
        "pdfPath": pdf_path,
        "version": "Ver.3.0",
        "annotations": [a.to_dict() for a in annotations]
    }
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def _dict_to_annotation(d: dict) -> Annotation:
    ann = Annotation(
        id=d["id"], ann_type=d["type"], layer=d["layer"],
        page_no=d.get("pageNo", 3), width=d.get("width", 2.0),
        rule_refs=d.get("ruleRefs", []),
        evidence_id=d.get("evidenceId",""),
        quantity=d.get("quantity", 0.0), unit=d.get("unit",""),
        label=d.get("label",""),
        card_auto=d.get("cardPosition","auto") == "auto",
        created_by=d.get("createdBy",""), confirmed=d.get("confirmed",False),
    )
    coords = d.get("coords", {})
    if "start" in coords: ann.start = Coord(**coords["start"])
    if "end"   in coords: ann.end   = Coord(**coords["end"])
    if "point" in coords: ann.point = Coord(**coords["point"])
    if "polygon" in coords:
        ann.polygon = [Coord(**p) for p in coords["polygon"]]
    if isinstance(d.get("cardPosition"), dict):
        ann.card_auto = False
        ann.card_x = d["cardPosition"]["x"]
        ann.card_y = d["cardPosition"]["y"]
    return ann


# ══════════════════════════════════════════════
# テスト実行：関根様邸の AnnotationJSON を作成 → PDF出力
# ══════════════════════════════════════════════
if __name__ == "__main__":
    # ── 関根様邸のAnnotationJSON（人が拾った座標）──
    # これは「人がアプリ上でクリックして確定した座標」を模擬したもの
    # 実際の実装ではUIからこの値が来る
    annotations = [
        Annotation(
            id="ANN-001", ann_type="line", layer="roof", page_no=3,
            start=Coord(181, 493), end=Coord(681, 493), width=3.5,
            rule_refs=["RULE-002"],
            label="軒とい NF-Ⅰ型", quantity=19.0, unit="m",
            evidence_id="EV-001-noki", card_auto=True,
            created_by="小野", confirmed=True
        ),
        Annotation(
            id="ANN-002", ann_type="point", layer="gutter", page_no=3,
            point=Coord(190, 493), width=1.5,
            rule_refs=["RULE-006","RULE-008"],
            label="集水器 F型（西）", quantity=1, unit="か所",
            evidence_id="EV-001-kasui-W", card_auto=True,
            created_by="小野", confirmed=True
        ),
        Annotation(
            id="ANN-003", ann_type="point", layer="gutter", page_no=3,
            point=Coord(663, 493), width=1.5,
            rule_refs=["RULE-006","RULE-008"],
            label="集水器 F型（東）", quantity=1, unit="か所",
            evidence_id="EV-001-kasui-E", card_auto=True,
            created_by="小野", confirmed=True
        ),
        Annotation(
            id="ANN-004", ann_type="line", layer="gutter", page_no=3,
            start=Coord(190, 497), end=Coord(190, 681), width=2.5,
            rule_refs=["RULE-011"],
            label="たてとい φ60（西）", quantity=6.475, unit="m",
            evidence_id="EV-001-tate-W",
            card_auto=False, card_x=102, card_y=558,  # 手動配置
            created_by="小野", confirmed=True
        ),
        Annotation(
            id="ANN-005", ann_type="line", layer="gutter", page_no=3,
            start=Coord(663, 497), end=Coord(663, 681), width=2.5,
            rule_refs=["RULE-011"],
            label="たてとい φ60（東）", quantity=6.475, unit="m",
            evidence_id="EV-001-tate-E", card_auto=True,
            created_by="小野", confirmed=True
        ),
        Annotation(
            id="ANN-006", ann_type="line", layer="vent", page_no=3,
            start=Coord(190, 475), end=Coord(663, 475), width=1.8,
            rule_refs=["RULE-005","RULE-201"],
            label="片流れ換気", quantity=1, unit="本",
            evidence_id="EV-001-vent", card_auto=True,
            created_by="小野", confirmed=True
        ),
        Annotation(
            id="ANN-007", ann_type="line", layer="roof", page_no=3,
            start=Coord(190, 489), end=Coord(663, 489), width=1.0,
            rule_refs=["RULE-003","RULE-007"],
            label="水上立ち上がり", quantity=16.6, unit="m",
            evidence_id="EV-001-mizu", card_auto=True,
            created_by="小野", confirmed=True
        ),
    ]

    # ── Evidence カード（Engineから生成される内容）──
    evidence_cards = {
        "EV-001-noki": EvidenceCard(
            title="軒とい NF-Ⅰ型",
            rows=[
                ("L = 19.0 m", "roof"),
                ("RULE-002  立面図実長", "gold"),
                ("Panasonic 標準品", "drain"),
            ],
            status="OK", rule_id="RULE-002", confidence=90
        ),
        "EV-001-kasui-W": EvidenceCard(
            title="集水器 F型（西角）",
            rows=[
                ("負担 42.8㎡ / 許容 69㎡", "gutter"),
                ("間隔  9.5m / ≤20m 基準", "gutter"),
                ("降雨強度 140mm/h 埼玉", "drain"),
            ],
            status="OK", rule_id="RULE-006,008", confidence=88
        ),
        "EV-001-kasui-E": EvidenceCard(
            title="集水器 F型（東角）",
            rows=[
                ("負担 42.8㎡ / 許容 69㎡", "gutter"),
                ("RULE-008  建物角配置", "gold"),
            ],
            status="OK", rule_id="RULE-006,008", confidence=88
        ),
        "EV-001-tate-W": EvidenceCard(
            title="たてとい φ60（西）",
            rows=[
                ("h = 6.475m  実長のみ", "gutter"),
                ("ロス計上なし（RULE-011）", "gold"),
            ],
            status="OK", rule_id="RULE-011", confidence=85
        ),
        "EV-001-tate-E": EvidenceCard(
            title="たてとい φ60（東）",
            rows=[
                ("h = 6.475m  実長のみ", "gutter"),
                ("RULE-011 ロスなし", "gold"),
            ],
            status="OK", rule_id="RULE-011", confidence=85
        ),
        "EV-001-vent": EvidenceCard(
            title="片流れ換気",
            rows=[
                ("天井 85.6㎡", "vent"),
                ("1P 対応 17.5㎡", "drain"),
                ("必要 1本  I-ROOF 1P", "vent"),
                ("RULE-005 棟換気禁止", "gold"),
            ],
            status="OK", rule_id="RULE-005,201", confidence=85
        ),
        "EV-001-mizu": EvidenceCard(
            title="水上立ち上がり",
            rows=[
                ("16.6m  立面図実長", "roof"),
                ("片流れ → RULE-901適用", "gold"),
            ],
            status="要確認", rule_id="RULE-007,901", confidence=72
        ),
    }

    # ── AnnotationJSON保存 ──
    save_annotations(
        annotations,
        "/mnt/user-data/outputs/関根様邸_AnnotationJSON.json",
        project_id="P2026-001",
        pdf_path="関根柊平様邸変更合意契約時図面.pdf"
    )
    print("AnnotationJSON保存完了")

    # ── PDF描画（RULE-411: 座標はAnnotationJSONから）──
    render_annotations_to_pdf(
        src_pdf="/mnt/user-data/uploads/関根柊平様邸変更合意契約時図面_制震ダンパー位置_.pdf",
        annotations=annotations,
        evidence_cards=evidence_cards,
        out_pdf="/mnt/user-data/outputs/関根様邸_赤ペンPDF_座標保証版.pdf"
    )
    print("PDF描画完了")
