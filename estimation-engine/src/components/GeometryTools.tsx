// 甍AI Geometry Tools（e0.3.7①② / 勾配伸び率）— ビュー兼シミュレーター。
//   責務: 勾配 → Geometry Engine（式）→ 表示。Measurement は書き換えない。
//   e0.3.7②: 拾いを選択すると pitch を初期値にプリフィル（A方式）。手動で変えて試算可。
//            Measurement を更新するのは「この勾配を拾いへ反映」を押した時だけ（Evidence First）。
//   計算は式（stretch / convert）。Knowledge(pitch.json) は「呼称辞書＋UI表示順」にのみ使う。
import { useEffect, useState } from 'react';
import { stretch } from '../geometry/stretch';
import { convert } from '../geometry/convert';
import PITCH from '../../knowledge/geometry/pitch.json';

// 呼称辞書＋表示順（値は使わない：伸び率は下で式から算出する）
const PITCHES = PITCH.table.map((p) => ({ label: `${p.name}（${p.fraction}）`, sun: p.m * 10 }));

interface Props {
  selectedId?: string | null;     // 選択中 Measurement の id（新規ドラフトは null）
  hasSelection?: boolean;         // 拾いを選択/編集中か
  selectedLabel?: string;
  selectedPitch?: number;         // 選択中 Measurement の pitch（＝Evidence 側の真実）
  onApplyPitch?: (pitch: number) => void; // 「拾いへ反映」＝ここでだけ Measurement を更新
  standalone?: boolean;           // 独立「勾配電卓」ページ用：選択ヘッダと反映ボタンを出さない
}

export default function GeometryTools({ selectedId = null, hasSelection = false, selectedLabel = '', selectedPitch, onApplyPitch, standalone = false }: Props) {
  const [sun, setSun] = useState(5);             // ツールの試算値（Measurement とは独立）
  const [horizontal, setHorizontal] = useState(4000); // 水平距離 mm

  // A（プリフィル）: 拾いを「選択し直した」時だけ、その勾配を初期値に入れる。
  // sun の手動変更では発火しない（selectedId のみを依存にする）＝試算はツール内で自由。
  useEffect(() => {
    if (selectedPitch && selectedPitch > 0) setSun(selectedPitch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // すべて式から（√(1+m²) など）。表示のみ丸める＝保存しない派生値。
  const angle = convert.sunToDegree(sun);
  const flowRate = stretch.area(sun);
  const hipH = stretch.hipVsHorizontal(sun);
  const hipS = stretch.hipVsSlope(sun);
  const flowLen = horizontal * flowRate;
  const hipLen = horizontal * hipH;

  // 試算中（ツールの勾配が Measurement の勾配と異なる＝未反映）
  const dirty = hasSelection && selectedPitch != null && sun !== selectedPitch;

  return (
    <div className="panel geomtools">
      <h3>Geometry Tools</h3>

      {!standalone && (hasSelection ? (
        <div className="gt-selected">
          <span className="gt-sel-tag">選択中</span>
          <b className="gt-sel-id">{selectedId ?? '新規'}</b>
          {selectedLabel && <span className="gt-sel-label">{selectedLabel}</span>}
          <span className="gt-sel-pitch">勾配：{selectedPitch ? `${selectedPitch}寸` : '未設定'}</span>
        </div>
      ) : (
        <div className="gt-selected gt-none">拾い未選択（手動で試算）</div>
      ))}

      <details open className="gt-tool">
        <summary>勾配伸び率</summary>

        <label className="gt-row gt-input">
          <span>勾配</span>
          <select value={sun} onChange={(e) => setSun(parseFloat(e.target.value))}>
            {PITCHES.map((p) => (
              <option key={p.sun} value={p.sun}>{p.label}</option>
            ))}
          </select>
        </label>

        {!standalone && (
          <div className="gt-apply-row">
            <button type="button" className="gt-apply" disabled={!hasSelection} onClick={() => onApplyPitch?.(sun)}>
              この勾配を拾いへ反映
            </button>
            {dirty && <small className="gt-dirty">試算中（未反映）</small>}
          </div>
        )}

        <div className="gt-readouts">
          <div className="gt-row"><span>角度</span><b>{angle.toFixed(2)}°</b></div>
          <div className="gt-row"><span>流れ伸び率</span><b>{flowRate.toFixed(3)}</b></div>
          <div className="gt-row"><span>隅棟（対水平）</span><b>{hipH.toFixed(3)}</b></div>
          <div className="gt-row"><span>隅棟（対流れ）</span><b>{hipS.toFixed(3)}</b></div>
        </div>

        <label className="gt-row gt-input">
          <span>水平距離</span>
          <span className="gt-inwrap">
            <input type="number" value={horizontal}
              onChange={(e) => setHorizontal(Math.max(0, parseFloat(e.target.value) || 0))} />
            <small>mm</small>
          </span>
        </label>

        <div className="gt-readouts gt-result">
          <div className="gt-row"><span>流れ長さ</span><b>{Math.round(flowLen).toLocaleString()}<small> mm</small></b></div>
          <div className="gt-row"><span>隅棟長さ</span><b>{Math.round(hipLen).toLocaleString()}<small> mm</small></b></div>
        </div>
        <div className="list-empty">隅棟は真隅（両面同勾配）の値。試算はここだけ。「反映」まで Measurement は変わりません（保存は pitch のみ）。</div>
      </details>
    </div>
  );
}
