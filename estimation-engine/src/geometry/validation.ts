// 甍AI Validation（汎用）— Model の妥当性判定。Reducer とは分離する（憲法6）。
//   Reducer は「編集するだけ」。Validator は「そのModelが成立しているか見るだけ」。
//   → Human/AI/Import が同じ Command を通しても、正否判定は1か所（Validator）に集約できる。
export type Severity = 'error' | 'warning';

// Quantity と同じ機構でハイライトするための根拠参照（{kind,id}）。Studio に専用選択ロジックを増やさない。
export interface EvidenceRef { kind: string; id: string; }

export interface ValidationIssue {
  code: string;                       // 例: 'DropOutsideEdge'
  severity: Severity;
  message: string;
  evidence: EvidenceRef[];            // 該当要素（クリックで光らせる。Quantity の evidence と同型）
}

export const hasErrors = (issues: ValidationIssue[]): boolean => issues.some((i) => i.severity === 'error');
export const errorsOf = (issues: ValidationIssue[]): ValidationIssue[] => issues.filter((i) => i.severity === 'error');
