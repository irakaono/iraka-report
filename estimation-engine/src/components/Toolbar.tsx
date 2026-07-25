// ツールバー: 図面読込 / Polygon / 縮尺較正 / スナップ / ズーム / 縮尺
interface Props {
  drawing: boolean;
  scale: number;
  zoom: number;
  snapOn: boolean;
  calibrating: boolean;
  canFinish: boolean;
  canUndo: boolean;
  onScale: (n: number) => void;
  onToggleSnap: () => void;
  onCalibrate: () => void;
  onResetView: () => void;
  onUndo: () => void;
  onNewPolygon: () => void;
  onFinish: () => void;
  onClear: () => void;
  onOpenFiles: () => void; // ファイル選択を開く（複数可・実体は App が保持）
}

export default function Toolbar(props: Props) {
  return (
    <div className="toolbar">
      <strong>甍AI 拾いエディタ</strong>
      <span style={{ opacity: 0.6, fontSize: 12 }}>e0.3.7</span>

      <button className="file" onClick={props.onOpenFiles}>図面を読み込む</button>

      <button onClick={props.onNewPolygon}>＋ 多角形を描く</button>
      <button onClick={props.onFinish} disabled={!props.drawing || !props.canFinish}>確定</button>
      <button className="ghost" onClick={props.onClear}>クリア</button>
      <button className="ghost" onClick={props.onUndo} disabled={!props.canUndo} title="Ctrl+Z">↶ 元に戻す</button>

      <button className="ghost" onClick={props.onCalibrate}
        style={props.calibrating ? { background: '#e8590c', borderColor: '#e8590c' } : undefined}>
        縮尺較正
      </button>
      <label>
        <input type="checkbox" checked={props.snapOn} onChange={props.onToggleSnap} /> スナップ
      </label>

      <span className="sp" />

      <label>
        縮尺(px/m)
        <input
          type="number"
          min={1}
          value={props.scale}
          onChange={(e) => props.onScale(Math.max(1, Number(e.target.value) || 1))}
        />
      </label>
      <span style={{ fontSize: 12 }}>ズーム {(props.zoom * 100).toFixed(0)}%</span>
      <button className="ghost" onClick={props.onResetView}>全体表示</button>
    </div>
  );
}
