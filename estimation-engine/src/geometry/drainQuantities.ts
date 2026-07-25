// 甍AI Drain Quantities — Evidence付き 雨樋数量。軒樋(runs) と 排水経路(graph) から派生。
//   竪樋長/呼び樋長 は Edge(=Segment) の向きから、エルボ/排水 は Node の kind から、決定的に導く（部材名を保存しない）。
//   evidence は kind:'segment'(edge) / 'node' / 'gutter_run'(軒Edge) / 'drop' ＝ Quantityと同型でハイライト。
import type { RoofModel, QuantityResult, QuantityEvidence } from './roofModel';
import type { DrainModel } from './drainModel';
import { eaveLengthM, edgeEnds, segmentKind, segmentLengthM } from './drainModel';

export function drainQuantities(roof: RoofModel, drain: DrainModel, scale: number): QuantityResult[] {
  const out: QuantityResult[] = [];
  const push = (key: string, label: string, unit: string, value: number, ev: QuantityEvidence[]) => { if (ev.length) out.push({ key, label, value, unit, evidence: ev }); };

  { // 軒樋長
    let v = 0; const ev: QuantityEvidence[] = [];
    for (const r of drain.runs) { const len = eaveLengthM(roof, r.eaveEdgeId, scale); if (len > 0) { v += len; ev.push({ kind: 'gutter_run', id: r.eaveEdgeId, contribution: len }); } }
    push('gutterLength', '軒樋長', 'm', v, ev);
  }
  { // 集水器数
    let v = 0; const ev: QuantityEvidence[] = [];
    for (const r of drain.runs) for (const d of r.drops) { v += 1; ev.push({ kind: 'drop', id: d.id, contribution: 1 }); }
    push('outletCount', '集水器数', '個', v, ev);
  }
  // 竪樋長 / 呼び樋長（Edge=Segment の向きから）
  {
    let ds = 0; const dsEv: QuantityEvidence[] = [];
    let cn = 0; const cnEv: QuantityEvidence[] = [];
    for (const e of drain.graph.edges) {
      const ends = edgeEnds(drain.graph, e); if (!ends) continue;
      const len = segmentLengthM(drain.graph, e, scale);
      if (segmentKind(ends.a, ends.b) === 'downspout') { ds += len; dsEv.push({ kind: 'segment', id: e.id, contribution: len }); }
      else { cn += len; cnEv.push({ kind: 'segment', id: e.id, contribution: len }); }
    }
    push('downspoutLength', '竪樋長', 'm', ds, dsEv);
    push('connectorLength', '呼び樋長', 'm', cn, cnEv);
  }
  // エルボ数 / 排水数（Node の kind から）
  {
    let el = 0; const elEv: QuantityEvidence[] = [];
    let dr = 0; const drEv: QuantityEvidence[] = [];
    for (const n of drain.graph.nodes) {
      if (n.kind === 'elbow') { el += 1; elEv.push({ kind: 'node', id: n.id, contribution: 1 }); }
      else if (n.kind === 'drain') { dr += 1; drEv.push({ kind: 'node', id: n.id, contribution: 1 }); }
    }
    push('elbowCount', 'エルボ数', '個', el, elEv);
    push('drainCount', '排水数', '個', dr, drEv);
  }
  return out;
}
