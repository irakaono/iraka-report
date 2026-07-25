// Measurement 一覧: クリックで選択 →（別図面なら）その図面へジャンプ → Canvasで光る。JSON書き出し。
import { useState } from 'react';
import type { Measurement } from '../geometry/types';

interface Props {
  measurements: Measurement[];
  selectedId: string | null;
  currentDrawingId: string | null;
  drawingNameById: Record<string, string>;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: () => void;
}

export default function MeasurementList(props: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null); // 二段階削除（ダイアログ不使用）
  return (
    <div className="panel list">
      <h3>保存済みデータ（{props.measurements.length}）</h3>

      {props.measurements.length === 0 && (
        <div className="list-empty">まだ拾いがありません。多角形を描いて保存してください。</div>
      )}

      {props.measurements.map((m) => {
        const dname = m.drawingId ? props.drawingNameById[m.drawingId] : '';
        const other = !!m.drawingId && m.drawingId !== props.currentDrawingId; // 別図面の拾い
        return (
          <div
            key={m.measurementId}
            className={'list-item' + (m.measurementId === props.selectedId ? ' sel' : '') + (other ? ' other' : '')}
            onClick={() => props.onSelect(m.measurementId)}
            title={dname ? `図面: ${dname}` : undefined}
          >
            <span>
              {m.label || '（無題）'}
              <br />
              <span className="id">{m.item}</span>
              {dname && <span className="dwg-tag">{other ? '→ ' : ''}{dname}</span>}
            </span>
            <span className="li-right">
              <span className="id">{m.measurementId}</span>
              <button
                className={'li-del' + (confirmId === m.measurementId ? ' confirm' : '')}
                title="この拾いを削除"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirmId !== m.measurementId) { setConfirmId(m.measurementId); return; }
                  props.onDelete(m.measurementId);
                  setConfirmId(null);
                }}
              >{confirmId === m.measurementId ? '削除' : '✕'}</button>
            </span>
          </div>
        );
      })}

      {props.measurements.length > 0 && (
        <button className="exp" onClick={props.onExport}>拾いデータを書き出す</button>
      )}
    </div>
  );
}
