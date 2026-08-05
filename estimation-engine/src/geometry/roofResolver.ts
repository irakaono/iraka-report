// 甍AI Phase F / Resolver（Ver0）— Roof Candidate[] → Roof Outline（屋根外形の確定）。
//   ★責務（PHASE-F-ROOF-ANALYZER.md §6.2 / §7）：F-2 の候補を**採用・棄却して外形を確定する**。
//     - **ポリゴンを削るのは Resolver だけ**。F-2（Roof Analyzer）は候補を出すだけで外形を変えない。
//       → F-2 が勝手にポリゴンを削って正にする事故を防ぐ規律。Roof Outline＝Resolver の確定結果。
//     - Ver0 は最も単純なルール：**exclusion 候補を外周から外す／keep・valley はそのまま残す**。
//   ★純関数・UI 非依存。入力は Geometry Facts（vertices が外形そのもの）＋ Candidate。外形は Facts から復元する
//     （Core 契約：Facts → Candidate → Resolver。ポリゴンを別引数で渡さない）。confidence・競合解決・複数 producer は将来。
//   ★軸：屋根・雨樋積算に効くか。目的は「ポーチ・出窓が外れた **きれいな屋根外形**」（壁外周≠屋根外形）。
//
//   除外の仕方（Ver0・軸整合を保つ）：張り出し（tab＝[depth1, cap, depth2]）を「付け根で切る」。
//     単純に先端2頂点を消して両付け根を直結すると、depth1≠depth2 の非対称 tab（L字角）で
//     外形を斜めに横切る誤カットになる。そこで **先端2頂点を「先端に近い方の付け根」を通る基線へ射影**する。
//       - 対称 tab（depth1=depth2）→ 先端が両付け根へ潰れ、平らな基線に戻る（＝単純な平し）。
//       - 非対称 tab（depth1≠depth2）→ 浅い側の付け根位置で軸整合に切り、斜め誤カットを出さない。
//     射影は depthAxis 方向の座標だけを基線値へ寄せる（もう一方の座標は保持）＝常に水平/垂直の外形を保つ。

import type { Pt } from './contourTrace';
import type { GeometryFeature } from './footprintFeatures';
import type { RoofCandidate } from './roofAnalyzer';

export interface RoofOutline {
  polygon: Pt[];       // 確定した屋根外形（除外候補を外周から外した結果）。first≠last の閉ポリゴン。
  removed: string[];   // 棄却した featureRef（外周から外した除外候補）。
  kept: string[];      // 採用した featureRef（外形に残した候補：body / large protrusion / valley）。
}

const EPS = 1e-6;

// 連続する同一点を除去（射影で先端が付け根に重なった場合の後始末）。
function dedupe(poly: Pt[]): Pt[] {
  const out: Pt[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    if (Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS) continue;
    out.push({ x: a.x, y: a.y });
  }
  return out.length ? out : poly.slice();
}

// 一般の共線マージ：連続3点 a-b-c が一直線（外積≈0）なら中点 b を除去。除去で辺が消えた付け根を平す。
function mergeCollinear(poly: Pt[]): Pt[] {
  let pts = poly.slice();
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    const out: Pt[] = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      const len = Math.hypot(c.x - a.x, c.y - a.y);
      if (len > EPS && Math.abs(cross) < EPS * Math.max(1, len)) { changed = true; continue; } // b は a-c 上 → 落とす
      out.push(b);
    }
    if (out.length >= 3) pts = out; else break;
  }
  return pts;
}

// Roof Candidate[] → Roof Outline（判定名を使わず kind だけで機械的に確定する）。
export function resolveRoofOutline(feature: GeometryFeature, candidates: RoofCandidate[]): RoofOutline {
  // 外形は Facts から復元（vertices が外形そのもの・edges/edgeIndices と同一順序）。以降は座標を複製して破壊しない。
  const poly: Pt[] = feature.vertices.map((v) => ({ x: v.x, y: v.y }));

  const removed: string[] = [];
  const kept: string[] = [];
  // 先端頂点 index → 射影後の座標。tab どうしは辺を共有しないので衝突しない。
  const project = new Map<number, Pt>();

  for (const c of candidates) {
    if (c.kind !== 'roof_exclusion_candidate') { kept.push(c.featureRef); continue; } // keep/valley は残す（削らない）。
    const m = /^protrusion-(\d+)$/.exec(c.featureRef);
    const tab = m ? feature.protrusions[Number(m[1])] : undefined;
    if (!tab) { kept.push(c.featureRef); continue; } // 参照不整合は安全側で残す（削らない）。

    const [depth1Edge, capEdge, depth2Edge] = tab.edgeIndices;
    const iB = capEdge, iC = depth2Edge;            // 先端2頂点 = cap 辺の両端。
    const B = poly[iB], C = poly[iC];               // 先端（外側）。
    const A = poly[depth1Edge];                     // 付け根1（edges[depth1Edge].a）。
    const D = poly[(depth2Edge + 1) % poly.length]; // 付け根2（edges[depth2Edge].b）。
    const key: 'x' | 'y' = tab.depthAxis === 'h' ? 'x' : 'y'; // 奥行方向の座標だけ動かす＝軸整合を保つ。
    const tip = B[key];                             // 先端の奥行座標（B と C は cap で直交＝同値）。
    // 「先端に近い方の付け根」を通る基線で切る＝はみ出しだけを外し、本体を斜めに切らない。
    const base = Math.abs(A[key] - tip) <= Math.abs(D[key] - tip) ? A[key] : D[key];
    project.set(iB, { x: B.x, y: B.y, [key]: base } as Pt);
    project.set(iC, { x: C.x, y: C.y, [key]: base } as Pt);
    removed.push(c.featureRef);
  }

  // 射影を反映 → 重複点除去 → 共線マージ（付け根を平す）。
  let outline = poly.map((p, i) => project.get(i) ?? p);
  outline = mergeCollinear(dedupe(outline));

  // 安全弁：万一 3 頂点未満に潰れたら確定せず元の外形を返す（削り過ぎ事故を防ぐ）。
  if (outline.length < 3) outline = poly.slice();

  return { polygon: outline, removed, kept };
}
