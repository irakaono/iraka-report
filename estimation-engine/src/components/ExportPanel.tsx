// 甍AI Estimation OS — Export Panel（e0.3.5④ / Adapter を起動する UI）
// 3 つの Adapter を「媒体へ写す」だけ。ここにも積算・変換・丸めは書かない。
//   ボタン押下 → buildExportResult() で ExportResult を作る → Adapter で媒体へ写す。だけ。
import { useState } from 'react';
import type { Measurement } from '../geometry/types';
import { buildExportResult } from '../geometry/exportResult';
import { toJson, toCsv } from '../geometry/exportAdapters';

interface Props {
  projectName: string;
  measurements: Measurement[];
  scale: number;
}

// ブラウザのダウンロードという「媒体」へ写すだけ（変換ではない）。
function download(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeName(name: string): string {
  return (name || '無題の案件').replace(/[\\/:*?"<>|]/g, '_');
}

export default function ExportPanel(props: Props) {
  const [copied, setCopied] = useState(false);

  // ExportResult は押下時に生成（exportedAt を呼び出し側で渡し純関数を保つ）。
  const build = () =>
    buildExportResult(props.projectName, props.measurements, props.scale, new Date().toISOString());

  const onJson = () => download(`${safeName(props.projectName)}.json`, toJson(build()), 'application/json');
  const onCsv = () => download(`${safeName(props.projectName)}.csv`, toCsv(build()), 'text/csv');
  const onCopy = async () => {
    await navigator.clipboard.writeText(toJson(build())); // JSON テキストをそのまま写すだけ
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const empty = props.measurements.length === 0;

  return (
    <div className="panel export">
      <h3>エクスポート（Public Contract）</h3>
      <div className="list-empty" style={{ marginBottom: 8 }}>
        ExportResult をそのまま媒体へ。JSON=無加工の契約全体 / CSV=数量表 / コピー=JSON。
        {empty && '（拾いを保存すると出力できます）'}
      </div>
      <div className="export-actions">
        <button type="button" onClick={onJson} disabled={empty}>JSON ダウンロード</button>
        <button type="button" onClick={onCsv} disabled={empty}>CSV ダウンロード</button>
        <button type="button" onClick={onCopy} disabled={empty}>{copied ? 'コピーしました' : 'クリップボードにコピー'}</button>
      </div>
    </div>
  );
}
