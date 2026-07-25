// 甍AI Roof Quantity Engine — Evidence First な数量エンジン（STEP1）。
//   Roof Model → 実面積・棟/隅棟/谷/ケラバ/軒 の実長を、すべて「根拠付き（QuantityResult）」で返す。
//   ExportResult へは value だけ渡す（内部は evidence を保持）。式は stretch.ts（唯一の正）。
import type { RoofModel, Edge, Face, EdgeRole, QuantityResult, QuantityEvidence } from './roofModel';
import { faceArea, edgeLength } from './roofModel';
import { edgeRole } from './roofEngine';
import { stretch } from './stretch';

function edgeFaces(model: RoofModel, edge: Edge): Face[] {
  return model.faces.filter((f) => f.boundary.includes(edge.id));
}
function pitchOf(faces: Face[]): number {
  return faces.find((f) => f.slope.pitch != null)?.slope.pitch ?? 0; // 未設定=0寸（伸び率1＝平面）
}

// 役割 → 表示名 と 伸び率（対象の平面量に掛ける）。stretch.ts に直結。
const ROLE: Record<EdgeRole, { label: string; ratio: (pitch: number) => number }> = {
  ridge:  { label: '棟長',   ratio: () => 1 },                 // 水平
  eave:   { label: '軒長',   ratio: () => 1 },                 // 水平（＝軒樋の素）
  hip:    { label: '隅棟長', ratio: (p) => stretch.hip(p) },   // 平面対角長 基準
  valley: { label: '谷長',   ratio: (p) => stretch.valley(p) },
  gable:  { label: 'ケラバ長', ratio: (p) => stretch.area(p) }, // 登り＝面積伸び率
};

/**
 * Roof Model の数量を Evidence 付きで算出する（純関数）。
 * @returns QuantityResult[]（roofArea ＋ 役割別の実長。空のものは含めない）
 */
export function roofQuantities(model: RoofModel, scale: number): QuantityResult[] {
  const s2 = scale * scale;
  const out: QuantityResult[] = [];

  // 1) 実屋根面積（㎡）= Σ 面の平面積[m²] × stretch.area(pitch)。根拠＝faces。
  {
    const ev: QuantityEvidence[] = [];
    let value = 0;
    for (const f of model.faces) {
      const planeM2 = faceArea(model, f) / s2;
      const actual = planeM2 * stretch.area(f.slope.pitch ?? 0);
      if (actual > 0) { value += actual; ev.push({ kind: 'face', id: f.id, contribution: actual }); }
    }
    if (ev.length) out.push({ key: 'roofArea', label: '実屋根面積', value, unit: '㎡', evidence: ev });
  }

  // 2) 役割別の実長（m）= Σ 辺の平面長[m] × 役割の伸び率。根拠＝edges（寄与量つき）。
  const acc: Partial<Record<EdgeRole, { value: number; ev: QuantityEvidence[] }>> = {};
  for (const e of model.edges) {
    const role = edgeRole(model, e);
    if (!role) continue;
    const pitch = pitchOf(edgeFaces(model, e));
    const lenM = edgeLength(model, e) / scale;
    const real = lenM * ROLE[role].ratio(pitch);
    if (real <= 0) continue;
    (acc[role] ??= { value: 0, ev: [] });
    acc[role]!.value += real;
    acc[role]!.ev.push({ kind: 'edge', id: e.id, contribution: real });
  }
  (['ridge', 'hip', 'valley', 'gable', 'eave'] as EdgeRole[]).forEach((role) => {
    const a = acc[role];
    if (a && a.ev.length) out.push({ key: role + 'Length', label: ROLE[role].label, value: a.value, unit: 'm', evidence: a.ev });
  });

  return out;
}

/** 逆引き：ある要素(id)が、どの数量にどれだけ効いているか（クリック→加算の説明用）。 */
export function evidenceOf(quantities: QuantityResult[], elementId: string): { key: string; label: string; contribution: number; unit: string }[] {
  const hits: { key: string; label: string; contribution: number; unit: string }[] = [];
  for (const q of quantities) {
    for (const ev of q.evidence) if (ev.id === elementId) hits.push({ key: q.key, label: q.label, contribution: ev.contribution, unit: q.unit });
  }
  return hits;
}

/** Export 用：evidence を落として value だけにする（ExportResult へはこれを渡す）。 */
export function toExportValues(quantities: QuantityResult[]): { key: string; label: string; value: number; unit: string }[] {
  return quantities.map((q) => ({ key: q.key, label: q.label, value: q.value, unit: q.unit }));
}
