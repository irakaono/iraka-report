// エクスプローラー（案件エクスプローラー）: 案件に属する図面一式＋保存操作を左に表示する。
// e0.3.2 で図面一覧、e0.3.3 で 保存/開く・自動保存表示・バックアップ復元 を追加。
// 器は将来 AI認識候補 / Measurement / 手積算比較 / Evidence まで生やす前提。
import type { Drawing } from '../geometry/types';

interface Backup { id: string; savedAt: string; projectName: string }

interface Props {
  projectName: string;
  drawings: Drawing[];
  currentId: string | null;
  countByDrawing: Record<string, number>;
  autosaveLabel: string;
  backups: Backup[];
  onRenameProject: (name: string) => void;
  onSelect: (id: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onAdd: () => void;         // 図面を追加（ファイル選択を開く）
  onSaveProject: () => void; // 案件を保存（.iraka.json）
  onOpenProject: () => void; // 案件を開く（.iraka.json）
  onRestoreBackup: (id: string) => void;
}

function fmt(iso: string): string {
  try { return new Date(iso).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

export default function Explorer(props: Props) {
  const idx = props.drawings.findIndex((d) => d.drawingId === props.currentId);

  return (
    <aside className="explorer">
      <h3>エクスプローラー</h3>

      <div className="proj">
        <span className="proj-ico">📁</span>
        <input
          className="proj-name"
          value={props.projectName}
          placeholder="案件名"
          onChange={(e) => props.onRenameProject(e.target.value)}
        />
      </div>

      <div className="proj-actions">
        <button onClick={props.onSaveProject} title="案件ファイル(.iraka.json)に保存">💾 案件を保存</button>
        <button onClick={props.onOpenProject} title="案件ファイル(.iraka.json)を開く">📂 開く</button>
      </div>
      <div className="autosave">{props.autosaveLabel}</div>

      {props.drawings.length === 0 ? (
        <div className="list-empty">
          まだ図面がありません。<br />「＋ 図面を追加」から複数のPDF/画像を取り込むか、キャンバスにドラッグ&ドロップしてください。
        </div>
      ) : (
        <div className="dwg-list">
          {props.drawings.map((d) => (
            <div
              key={d.drawingId}
              className={'dwg-item' + (d.drawingId === props.currentId ? ' sel' : '')}
              onClick={() => props.onSelect(d.drawingId)}
              title={d.name}
            >
              <span className="dwg-ico">📄</span>
              <span className="dwg-name">{d.name}</span>
              {props.countByDrawing[d.drawingId] > 0 && (
                <span className="dwg-count" title="この図面の拾い数">{props.countByDrawing[d.drawingId]}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {props.drawings.length > 1 && (
        <div className="dwg-nav">
          <button onClick={props.onPrev} disabled={idx <= 0}>← 前の図面</button>
          <button onClick={props.onNext} disabled={idx < 0 || idx >= props.drawings.length - 1}>次の図面 →</button>
        </div>
      )}

      <button className="add" onClick={props.onAdd}>＋ 図面を追加</button>

      {props.backups.length > 0 && (
        <details className="backups">
          <summary>バックアップから復元（{props.backups.length}）</summary>
          {props.backups.map((b) => (
            <div key={b.id} className="backup-item" onClick={() => props.onRestoreBackup(b.id)} title="この時点に戻す">
              <span className="backup-time">{fmt(b.savedAt)}</span>
              <span className="backup-name">{b.projectName || '（無題）'}</span>
            </div>
          ))}
        </details>
      )}
    </aside>
  );
}
