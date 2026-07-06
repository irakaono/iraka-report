/**
 * 甍AI積算エンジン — Assembly 基底クラス  Ver.3.0
 * Face → Edge → Assembly → Estimate → Evidence
 */
export class BaseAssembly {
  constructor(type, params) {
    this.type          = type;
    this.ruleRefs      = [];
    this.confidence    = 90;
    this.humanRequired = false;
    this.interimNote   = null;
    this.reasoning     = [];
    this.alerts        = [];
    this.futureNote    = [];
    this._params       = params;
  }
  calculate() { throw new Error(`${this.type}: calculate() not implemented`); }
  addStep(step, action, ruleRef, description, result, uncertainty = null) {
    this.reasoning.push({ step, action, ruleRef, description, result, uncertainty });
    if (uncertainty) { this.confidence = Math.max(50, this.confidence - 15); this.humanRequired = true; }
  }
  addAlert(level, ruleRef, msg) {
    this.alerts.push({ level, ruleRef, msg });
    if (level === 'ERROR') this.humanRequired = true;
  }
  toJSON() {
    return {
      assembly:this.type, ruleRefs:this.ruleRefs,
      confidence:this.confidence, humanRequired:this.humanRequired,
      interimNote:this.interimNote, alerts:this.alerts,
      reasoning:this.reasoning, futureNote:this.futureNote,
      ...this._output()
    };
  }
  _output() { return {}; }
}
