// プロパティ: 編集中の Measurement を直接編集する（画面 → Measurement）。
import { useEffect, useState } from 'react';

interface Props {
  active: boolean;
  vertexCount: number;
  areaM2: number;             // 平面積（水平投影）
  pitch?: number;             // 勾配（寸）e0.3.5。保存する唯一の値
  actualAreaM2: number | null; // 実面積（派生：平面積×伸び率）。勾配未設定なら null
  stretchRatio: number | null; // 伸び率（派生）。表示用
  onChangePitch: (v: number | undefined) => void;
  label: string;
  trade: string;
  item: string;
  editingId: string | null; // 既存編集中なら M-00x、新規なら null
  revision: number;
  status: 'editing' | 'confirmed' | 'locked';
  canSave: boolean;
  onChange: (field: 'label' | 'trade' | 'item', value: string) => void;
  onSave: () => void;
  onDelete?: (id: string) => void; // 選択中の保存済み拾いを削除
}

export default function Properties(props: Props) {
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => { setConfirmDel(false); }, [props.editingId]); // 選択が変わったら確認状態をリセット
  return (
    <div className="panel">
      <h3>
        拾いデータ
        {props.active && (
          <span style={{ float: 'right', fontSize: 11, color: props.editingId ? '#e8590c' : '#2e74b5' }}>
            {props.editingId ? `編集中 ${props.editingId}` : '新規'}
          </span>
        )}
      </h3>

      {!props.active && (
        <div className="list-empty">「＋ 多角形を描く」か、一覧の項目をクリックして編集を開始。</div>
      )}

      <div className="kv"><span>図形</span><b>多角形</b></div>
      <div className="kv"><span>拾い種類</span><b>面積</b></div>
      <div className="kv"><span>頂点数</span><b>{props.vertexCount}</b></div>
      {props.active && (
        <div className="kv"><span>状態 / 版</span><b>{statusLabel(props.status)} · rev{props.revision}</b></div>
      )}

      {/* 平面積（水平投影）と、勾配を入れると実面積（派生） */}
      <div className="area">
        {props.areaM2.toFixed(2)}<small> ㎡（平面）</small>
      </div>
      {props.actualAreaM2 != null && (
        <div className="area-actual">
          実面積 {props.actualAreaM2.toFixed(2)}<small> ㎡</small>
          <span className="ratio">勾配{props.pitch}寸 × {props.stretchRatio?.toFixed(3)}</span>
        </div>
      )}

      <div className="field">
        勾配（寸）<small style={{ color: '#8a95a1' }}>　空欄＝平面積のまま。伸び率は自動</small>
        <input type="number" min={0} step={0.5} value={props.pitch ?? ''} placeholder="例: 4.5" disabled={!props.active}
          onChange={(e) => props.onChangePitch(e.target.value === '' ? undefined : Number(e.target.value))} />
      </div>

      <div className="field">
        名称（拾い名）
        <input value={props.label} placeholder="屋根面A" disabled={!props.active}
          onChange={(e) => props.onChange('label', e.target.value)} />
      </div>
      <div className="field">
        工種
        <input value={props.trade} placeholder="屋根工事" disabled={!props.active}
          onChange={(e) => props.onChange('trade', e.target.value)} />
      </div>
      <div className="field">
        積算項目（集約先）
        <input value={props.item} placeholder="横暖S 本体" disabled={!props.active}
          onChange={(e) => props.onChange('item', e.target.value)} />
      </div>

      <button className="save" disabled={!props.canSave} onClick={props.onSave}>
        {props.editingId ? '拾いデータを更新' : '拾いデータを保存'}
      </button>

      {props.editingId && props.onDelete && (
        <button
          className={'del-measure' + (confirmDel ? ' confirm' : '')}
          onClick={() => {
            if (!confirmDel) { setConfirmDel(true); return; }
            props.onDelete!(props.editingId!);
            setConfirmDel(false);
          }}
        >
          {confirmDel ? 'もう一度押すと削除します' : '🗑 この拾いを削除'}
        </button>
      )}
    </div>
  );
}

// 状態の値は内部では英語のまま（データ互換）。表示だけ日本語化する。
function statusLabel(status: 'editing' | 'confirmed' | 'locked'): string {
  return status === 'confirmed' ? '確定' : status === 'locked' ? 'ロック' : '編集中';
}
