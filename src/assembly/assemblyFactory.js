/**
 * 甍AI積算エンジン — Assembly Factory
 * 全9種のAssemblyを生成する
 * Face → Edge → Assembly → Estimate → Evidence
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { BaseAssembly } from './BaseAssembly.js';
import { calcValley, getValleyRate } from '../calcValley.js';

const __dir  = dirname(fileURLToPath(import.meta.url));
const K_BASE = join(__dir, '../../../iraka_knowledge');
const SPECS  = JSON.parse(
  readFileSync(join(K_BASE, 'makers/assembly_specs.json'), 'utf8')
).assemblies;

// ── ヘルパー ──
const ceil   = Math.ceil;
const round2 = n => +n.toFixed(2);
const round3 = n => +n.toFixed(3);
function pieces(len, spec) { return ceil(len / (spec.effectiveLength_mm / 1000)); }
function orderLen(n, spec)  { return round2(n * spec.nominalLength_mm / 1000); }
function joints(n)          { return n - 1; }


// ══════════════════════════════════════════════
// 1. ValleyAssembly — 谷（RULE-120〜124）
// ══════════════════════════════════════════════
class ValleyAssembly extends BaseAssembly {
  constructor(p) { super('Valley', p); this.ruleRefs = ['RULE-120','RULE-121','RULE-122','RULE-123','RULE-124']; }
  calculate() {
    const { planLength, mainSlope_sun, shimoyaSlope_sun = null } = this._params;
    const sp = SPECS.Valley;
    const vr = calcValley({ planLength, mainSlope_sun, shimoyaSlope_sun });
    const pc = pieces(vr.actualLength, sp);
    const jt = joints(pc);
    const sc = pc * sp.screw_per_piece;
    const sl = jt * sp.sealer_per_joint;
    const lb = round3(vr.actualLength * sp.labor_per_m);
    if (vr.multiSlope) {
      this.confidence = 75;
      this.interimNote = `【暫定】複数勾配→大きい方${vr.usedSlope}寸採用。将来: Face×Faceへ移行`;
    }
    this.futureNote = ['将来v1: Face×FaceからLine生成','将来v2: 谷専用実長計算','将来v3: RoofGraphから自動抽出'];
    this.addStep(1,'計算','RULE-120',`谷実長 = ${planLength}m × ${vr.rate}`,`${vr.actualLength}m`);
    this.addStep(2,'計算','RULE-121',`必要枚数 ceil(${vr.actualLength}÷${sp.effectiveLength_mm/1000})`,`${pc}枚 発注${orderLen(pc,sp)}m`);
    this.addStep(3,'計算','RULE-123',`ジョイント${jt}か所 ビス${sc}本 シーラー${sl}本`,`副資材確定`);
    this._pc=pc; this._jt=jt; this._sc=sc; this._sl=sl; this._lb=lb; this._vr=vr;
    return this;
  }
  _output() { const v=this._vr, sp=SPECS.Valley; return {
    planLength:v.planLength, actualLength:v.actualLength, rate:v.rate, usedSlope:v.usedSlope,
    material:sp.material, pieces:this._pc, orderLength:orderLen(this._pc,sp),
    joints:this._jt, screwTotal:this._sc, sealerTotal:this._sl, labor:this._lb
  }; }
}

// ══════════════════════════════════════════════
// 2. RidgeAssembly — 棟・片棟（RULE-002,RULE-005）
// ══════════════════════════════════════════════
class RidgeAssembly extends BaseAssembly {
  constructor(p) { super('Ridge', p); this.ruleRefs = ['RULE-002','RULE-003','RULE-005','RULE-200','RULE-201']; }
  calculate() {
    const { length, isKatamune = false, ceilingArea = 0, ventType = 'katanagare' } = this._params;
    const sp = SPECS.Ridge;
    const pc = pieces(length, sp);
    const jt = joints(pc);
    const sc = pc * sp.screw_per_piece;
    const sl = jt * sp.sealer_per_joint;
    const lb = round3(length * sp.labor_per_m);
    // 下地（通気部材）
    const underlayPc = pieces(length, { effectiveLength_mm: sp.underlayLength_mm - sp.underlayOverlap_mm });
    // 換気本数（RULE-005: 片棟は棟換気禁止）
    let ventCount = 0, ventRule = '';
    if (ceilingArea > 0) {
      if (isKatamune) {
        const cap = ventType === 'katanagare' ? 17.5 : 35;
        ventCount = ceil(ceilingArea / cap);
        ventRule  = 'RULE-201';
      } else {
        ventCount = ceil(ceilingArea / 35);
        ventRule  = 'RULE-200';
      }
    }
    if (isKatamune && ventType === 'mune') {
      this.addAlert('ERROR','RULE-005','片棟なのに棟換気が指定されています。片流れ換気(RULE-201)を使用してください。');
    }
    this.addStep(1,'計算','RULE-002',`棟長${length}m → ${pc}枚 発注${orderLen(pc,sp)}m`,`${pc}枚`);
    this.addStep(2,'計算',ventRule||'RULE-005',`換気${ventCount}本 (天井${ceilingArea}㎡)`,`${ventCount}本`);
    this._pc=pc;this._jt=jt;this._sc=sc;this._sl=sl;this._lb=lb;this._underlayPc=underlayPc;this._ventCount=ventCount;this._length=length;this._isKata=isKatamune;
    return this;
  }
  _output() { const sp=SPECS.Ridge; return {
    length:this._length, isKatamune:this._isKata,
    material:sp.material, pieces:this._pc, orderLength:orderLen(this._pc,sp),
    underlayPieces:this._underlayPc, joints:this._jt,
    screwTotal:this._sc, sealerTotal:this._sl, labor:this._lb,
    ventCount:this._ventCount
  }; }
}

// ══════════════════════════════════════════════
// 3. HipAssembly — 隅棟（RULE-120系）
// ══════════════════════════════════════════════
class HipAssembly extends BaseAssembly {
  constructor(p) { super('Hip', p); this.ruleRefs = ['RULE-120','RULE-121','RULE-122','RULE-123']; }
  calculate() {
    const { planLength, slope_sun } = this._params;
    const sp    = SPECS.Hip;
    const rate  = getValleyRate(slope_sun); // 隅棟も同じ伸び率
    const actual = round3(planLength * rate);
    const pc = pieces(actual, sp);
    const jt = joints(pc);
    const sc = pc * sp.screw_per_piece;
    const sl = jt * sp.sealer_per_joint;
    const lb = round3(actual * sp.labor_per_m);
    this.addStep(1,'計算','RULE-120',`隅棟実長 = ${planLength}m × ${round2(rate)}`,`${actual}m`);
    this.addStep(2,'計算','RULE-121',`${pc}枚 発注${orderLen(pc,sp)}m`,`${pc}枚`);
    this._planLength=planLength;this._actual=actual;this._rate=rate;this._pc=pc;this._jt=jt;this._sc=sc;this._sl=sl;this._lb=lb;
    return this;
  }
  _output() { const sp=SPECS.Hip; return {
    planLength:this._planLength, actualLength:this._actual, rate:round2(this._rate),
    material:sp.material, pieces:this._pc, orderLength:orderLen(this._pc,sp),
    joints:this._jt, screwTotal:this._sc, sealerTotal:this._sl, labor:this._lb
  }; }
}

// ══════════════════════════════════════════════
// 4. EaveAssembly — 軒（捨唐草60・桟鼻）
// ══════════════════════════════════════════════
class EaveAssembly extends BaseAssembly {
  constructor(p) { super('Eave', p); this.ruleRefs = ['RULE-002','RULE-003']; }
  calculate() {
    const { length } = this._params;
    const sp = SPECS.Eave;
    const pc = pieces(length, sp);
    const sc = pc * sp.screw_per_piece;
    const lb = round3(length * sp.labor_per_m);
    this.addStep(1,'計算','RULE-002',`軒先${length}m → 捨唐草60 ${pc}本`,`${pc}本`);
    this._length=length;this._pc=pc;this._sc=sc;this._lb=lb;
    return this;
  }
  _output() { const sp=SPECS.Eave; return {
    length:this._length, material:sp.material,
    pieces:this._pc, orderLength:orderLen(this._pc,sp),
    screwTotal:this._sc, labor:this._lb
  }; }
}

// ══════════════════════════════════════════════
// 5. VergeAssembly — ケラバ（捨唐草45）
// ══════════════════════════════════════════════
class VergeAssembly extends BaseAssembly {
  constructor(p) { super('Verge', p); this.ruleRefs = ['RULE-002','RULE-003']; }
  calculate() {
    const { length } = this._params;
    const sp = SPECS.Verge;
    const pc = pieces(length, sp);
    const sc = pc * sp.screw_per_piece;
    const lb = round3(length * sp.labor_per_m);
    this.addStep(1,'計算','RULE-002',`ケラバ${length}m → 捨唐草45 ${pc}本`,`${pc}本 (立面図実長 RULE-003)`);
    this._length=length;this._pc=pc;this._sc=sc;this._lb=lb;
    return this;
  }
  _output() { const sp=SPECS.Verge; return {
    length:this._length, material:sp.material,
    pieces:this._pc, orderLength:orderLen(this._pc,sp),
    screwTotal:this._sc, labor:this._lb
  }; }
}

// ══════════════════════════════════════════════
// 6. ApronAssembly — 雨押え（RULE-003）
// ══════════════════════════════════════════════
class ApronAssembly extends BaseAssembly {
  constructor(p) { super('Apron', p); this.ruleRefs = ['RULE-003','RULE-007']; }
  calculate() {
    const { length, roofType = '' } = this._params;
    const sp = SPECS.Apron;
    const pc = pieces(length, sp);
    const jt = joints(pc);
    const sc = pc * sp.screw_per_piece;
    const sl = jt * sp.sealer_per_joint;
    const lb = round3(length * sp.labor_per_m);
    const isKata = roofType.includes('katanagare');
    if (isKata) {
      this.confidence = 70;
      this.interimNote = '【確認】片流れ建物の雨押え範囲は物件ごとに確認（RULE-007）';
      this.humanRequired = true;
    }
    this.addStep(1,'計算','RULE-003',`雨押え${length}m → ${pc}枚 (立面図実長・伸び率不要)`,`${pc}枚`);
    this._length=length;this._pc=pc;this._jt=jt;this._sc=sc;this._sl=sl;this._lb=lb;
    return this;
  }
  _output() { const sp=SPECS.Apron; return {
    length:this._length, material:sp.material,
    pieces:this._pc, orderLength:orderLen(this._pc,sp),
    joints:this._jt, screwTotal:this._sc, sealerTotal:this._sl, labor:this._lb
  }; }
}

// ══════════════════════════════════════════════
// 7. GutterAssembly — 軒とい（RULE-002,RULE-300）
// ══════════════════════════════════════════════
class GutterAssembly extends BaseAssembly {
  constructor(p) { super('Gutter', p); this.ruleRefs = ['RULE-002','RULE-300','RULE-006','RULE-008']; }
  calculate() {
    const { length, gutterCount, projectionArea, location = 'saitama' } = this._params;
    const sp  = SPECS.Gutter;
    const pc  = pieces(length, sp);
    const jt  = joints(pc);
    const brkt= ceil(length * sp.bracket_per_m);
    const lb  = round3(length * sp.labor_per_m);
    const cap = location === 'saitama' ? 69 : 69;
    const areaPerGutter = round2(projectionArea / gutterCount);
    const spacingOk = (length / gutterCount) <= 20;
    if (!spacingOk) this.addAlert('WARNING','RULE-300',`竪樋間隔${round2(length/gutterCount)}m > 20m超過`);
    if (areaPerGutter > cap) this.addAlert('WARNING','RULE-006',`集水器負担${areaPerGutter}㎡ > ${cap}㎡超過`);
    this.addStep(1,'計算','RULE-002',`軒とい${length}m → ${pc}本`,`${pc}本`);
    this.addStep(2,'確認','RULE-300',`1か所負担${areaPerGutter}㎡ / 許容${cap}㎡ 間隔${round2(length/gutterCount)}m`,spacingOk?'OK':'⚠要確認');
    this._length=length;this._pc=pc;this._jt=jt;this._brkt=brkt;this._lb=lb;this._apg=areaPerGutter;this._gc=gutterCount;
    return this;
  }
  _output() { const sp=SPECS.Gutter; return {
    length:this._length, material:sp.material,
    pieces:this._pc, orderLength:orderLen(this._pc,sp),
    joints:this._jt, brackets:this._brkt,
    gutterCount:this._gc, areaPerGutter:this._apg, labor:this._lb
  }; }
}

// ══════════════════════════════════════════════
// 8. DownspoutAssembly — たてとい（RULE-011）
// ══════════════════════════════════════════════
class DownspoutAssembly extends BaseAssembly {
  constructor(p) { super('Downspout', p); this.ruleRefs = ['RULE-011','RULE-008']; }
  calculate() {
    const { height, count } = this._params;
    const sp      = SPECS.Downspout;
    const totalLen = round2(height * count);
    const pipeCount= ceil(height / (sp.nominalLength_mm / 1000)) * count;
    const brkt    = ceil(totalLen * sp.bracket_per_m);
    const elbows  = count * 2;  // 上エルボ + 下エルボ
    const lb      = round3(totalLen * sp.labor_per_m);
    this.addStep(1,'計算','RULE-011',`たてとい実長 ${height}m × ${count}本 = ${totalLen}m (ロスなし)`,`${totalLen}m`);
    this.addStep(2,'計算','RULE-008',`エルボ${elbows}個 金具${brkt}個`,`副資材確定`);
    this._height=height;this._count=count;this._total=totalLen;this._pipes=pipeCount;this._brkt=brkt;this._elbows=elbows;this._lb=lb;
    return this;
  }
  _output() { const sp=SPECS.Downspout; return {
    height:this._height, count:this._count, totalLength:this._total,
    material:sp.material, pipeCount:this._pipes,
    elbows:this._elbows, brackets:this._brkt,
    pmasuCount:this._count, labor:this._lb
  }; }
}

// ══════════════════════════════════════════════
// 9. VentAssembly — 換気部材（RULE-004,RULE-201,RULE-202）
// ══════════════════════════════════════════════
class VentAssembly extends BaseAssembly {
  constructor(p) { super('Vent', p); this.ruleRefs = ['RULE-004','RULE-005','RULE-201','RULE-202']; }
  calculate() {
    const { ceilingArea, shimoyaCeiling = 0, roofType = '' } = this._params;
    const sp  = SPECS.Vent;
    const isKata = roofType.includes('katanagare') || roofType.includes('kirituma');
    let mainCount = 0, mainRule = '', amaoshiCount = 0;
    if (isKata) {
      mainCount = Math.ceil(ceilingArea / 17.5); mainRule = 'RULE-201';
    } else {
      mainCount = Math.ceil(ceilingArea / 35); mainRule = 'RULE-200';
    }
    if (shimoyaCeiling > 0) amaoshiCount = Math.ceil(shimoyaCeiling / 18.4);
    const totalCount = mainCount + amaoshiCount;
    const sc = totalCount * sp.screw_per_unit;
    const sl = round2(totalCount * sp.sealer_per_unit);
    const lb = round3(totalCount * sp.labor_per_unit);
    if (isKata && mainRule === 'RULE-200') {
      this.addAlert('ERROR','RULE-005','片棟なのに棟換気が指定されています。');
    }
    this.addStep(1,'計算',mainRule,
      `主屋天井${ceilingArea}㎡ → ${mainCount}本`,`${mainCount}本 (RULE-004: 天井面積で計算)`);
    if (shimoyaCeiling > 0)
      this.addStep(2,'計算','RULE-202',
        `下屋天井${shimoyaCeiling}㎡ → 雨押え換気${amaoshiCount}本`,`${amaoshiCount}本`);
    this._main=mainCount;this._ama=amaoshiCount;this._total=totalCount;this._sc=sc;this._sl=sl;this._lb=lb;
    return this;
  }
  _output() { return {
    mainVentCount:this._main, amaoshiVentCount:this._ama, totalCount:this._total,
    material:SPECS.Vent.material, screwTotal:this._sc, sealerTotal:this._sl, labor:this._lb
  }; }
}

// ══════════════════════════════════════════════
// 10. SnowStopAssembly — 雪止め（RULE-002）
// ══════════════════════════════════════════════
class SnowStopAssembly extends BaseAssembly {
  constructor(p) { super('SnowStop', p); this.ruleRefs = ['RULE-002']; }
  calculate() {
    const { length } = this._params;
    const sp = SPECS.SnowStop;
    const units = ceil(length * sp.units_per_m);
    const lb    = round3(length * sp.labor_per_m);
    this.addStep(1,'計算','RULE-002',`雪止め${length}m → ${units}個 (軒先のみ)`,`${units}個`);
    this._length=length;this._units=units;this._lb=lb;
    return this;
  }
  _output() { return {
    length:this._length, material:SPECS.SnowStop.material,
    units:this._units, labor:this._lb
  }; }
}

// ── Factory関数 ──
const FACTORIES = {
  Valley:     p => new ValleyAssembly(p),
  Ridge:      p => new RidgeAssembly(p),
  Hip:        p => new HipAssembly(p),
  Eave:       p => new EaveAssembly(p),
  Verge:      p => new VergeAssembly(p),
  Apron:      p => new ApronAssembly(p),
  Gutter:     p => new GutterAssembly(p),
  Downspout:  p => new DownspoutAssembly(p),
  Vent:       p => new VentAssembly(p),
  SnowStop:   p => new SnowStopAssembly(p),
};

/**
 * createAssembly(type, params)
 * 指定タイプのAssemblyを生成して計算結果をJSONで返す
 */
export function createAssembly(type, params) {
  const factory = FACTORIES[type];
  if (!factory) throw new Error(`Unknown assembly type: ${type}`);
  return factory(params).calculate().toJSON();
}

/**
 * createRoofAssembly(estimate)
 * 積算全体からRoof Assembly全体を一括生成する
 */
export function createRoofAssembly(estimate) {
  const { roofType, summary, areas, lengths, ventilation, drainage } = estimate;
  const assemblies = {};

  if (lengths?.noki > 0)
    assemblies.Eave       = createAssembly('Eave',     { length: lengths.noki });
  if (lengths?.keraba > 0)
    assemblies.Verge      = createAssembly('Verge',    { length: lengths.keraba });
  if (lengths?.katamune > 0)
    assemblies.Ridge      = createAssembly('Ridge', {
      length: lengths.katamune, isKatamune: true,
      ceilingArea: areas?.ceilingArea || 0, ventType:'katanagare'
    });
  if (lengths?.amaoshi > 0)
    assemblies.Apron      = createAssembly('Apron',    { length: lengths.amaoshi, roofType });
  if (lengths?.noki > 0)
    assemblies.SnowStop   = createAssembly('SnowStop', { length: lengths.yukidome || lengths.noki });

  // 雨樋
  if (drainage?.nokiTotal > 0)
    assemblies.Gutter     = createAssembly('Gutter', {
      length: drainage.nokiTotal, gutterCount: drainage.gutterCount,
      projectionArea: areas?.totalProj || 0
    });
  if (drainage?.tatetoi_total > 0)
    assemblies.Downspout  = createAssembly('Downspout', {
      height: lengths?.tatetoi_height_2F || 6.0, count: drainage.gutterCount
    });

  // 換気
  if (areas?.ceilingArea > 0)
    assemblies.Vent       = createAssembly('Vent', {
      ceilingArea: areas.ceilingArea,
      shimoyaCeiling: areas.shimoYaCeiling || 0,
      roofType
    });

  return assemblies;
}

export {
  ValleyAssembly, RidgeAssembly, HipAssembly,
  EaveAssembly, VergeAssembly, ApronAssembly,
  GutterAssembly, DownspoutAssembly, VentAssembly, SnowStopAssembly
};
