// 甍AI v1.0 の入口画面。平面図・立面図をドロップ（PDF/画像）→「積算開始」で Studio へ。
//   ★ここは「使える入口」。完全自動認識ではなく、図面を取り込み → 既存 Studio で人が確認・修正 → 数量確定 の一周目。
//   PDF は1枚目を画像化して背景に使う（pdfjs を必要時だけ CDN から遅延ロード＝バンドルを太らせない。画像はオフラインでも動く）。
import { useRef, useState } from 'react';

export interface DrawingSet {
  planSrc: string | null;
  planName: string | null;
  elevationSrc: string | null;
  elevationName: string | null;
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// PDF 1枚目を PNG dataURL に。pdfjs は初回だけ CDN から動的 import（バンドルに含めない）。
const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';

async function pdfFirstPageToDataURL(file: File): Promise<string> {
  const spec = PDFJS_CDN; // 変数経由にして TS のモジュール解決(TS2307)を回避。実行時に URL から動的 import。
  const pdfjs: any = await import(/* @vite-ignore */ spec);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context 取得失敗');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/png');
}

async function fileToImageSrc(file: File): Promise<string> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) return pdfFirstPageToDataURL(file);
  if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) return readAsDataURL(file);
  throw new Error('対応形式は PDF / 画像（PNG・JPG 等）です');
}

interface ZoneProps {
  label: string;
  src: string | null;
  name: string | null;
  busy: boolean;
  error: string | null;
  onPick: (file: File) => void;
  onClear: () => void;
}

function DropZone({ label, src, name, busy, error, onPick, onClear }: ZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onPick(f); }}
      onClick={() => inputRef.current?.click()}
      style={{
        flex: 1, minHeight: 200, border: `2px dashed ${over ? '#1971c2' : src ? '#2f9e44' : '#c7d0da'}`,
        borderRadius: 12, background: over ? '#e7f1fb' : src ? '#f2fbf5' : '#fafcff',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', padding: 16, position: 'relative', textAlign: 'center', transition: 'all .12s',
      }}
    >
      <input ref={inputRef} type="file" accept="application/pdf,image/*,.pdf,.png,.jpg,.jpeg,.webp"
        style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }} />
      {busy ? (
        <div style={{ color: '#1971c2', fontWeight: 600 }}>読み込み中…</div>
      ) : src ? (
        <>
          <img src={src} alt={label} style={{ maxWidth: '100%', maxHeight: 150, borderRadius: 6, boxShadow: '0 1px 6px rgba(0,0,0,.15)' }} />
          <div style={{ marginTop: 8, fontSize: 12, color: '#495057', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
          <button onClick={(e) => { e.stopPropagation(); onClear(); }}
            style={{ position: 'absolute', top: 8, right: 8, border: 'none', background: '#fff', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }}>×</button>
        </>
      ) : (
        <>
          <div style={{ fontSize: 34, lineHeight: 1 }}>⬆</div>
          <div style={{ marginTop: 10, fontWeight: 700, fontSize: 15, color: '#2f3b47' }}>{label}をドロップ</div>
          <div style={{ marginTop: 4, fontSize: 12, color: '#8a97a5' }}>PDF / 画像（クリックでも選択）</div>
        </>
      )}
      {error && <div style={{ marginTop: 8, fontSize: 12, color: '#e03131' }}>⚠ {error}</div>}
    </div>
  );
}

export default function DropLanding({ onStart }: { onStart: (d: DrawingSet) => void }) {
  const [plan, setPlan] = useState<{ src: string | null; name: string | null }>({ src: null, name: null });
  const [elev, setElev] = useState<{ src: string | null; name: string | null }>({ src: null, name: null });
  const [busy, setBusy] = useState<{ plan: boolean; elev: boolean }>({ plan: false, elev: false });
  const [err, setErr] = useState<{ plan: string | null; elev: string | null }>({ plan: null, elev: null });

  const pick = async (which: 'plan' | 'elev', file: File) => {
    setBusy((b) => ({ ...b, [which]: true }));
    setErr((e) => ({ ...e, [which]: null }));
    try {
      const src = await fileToImageSrc(file);
      const val = { src, name: file.name };
      if (which === 'plan') setPlan(val); else setElev(val);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr((prev) => ({ ...prev, [which]: /pdf/i.test(msg) || msg.includes('import') ? 'PDF読込に失敗（オフライン時はPDF不可）。画像で入れてください' : msg }));
    } finally {
      setBusy((b) => ({ ...b, [which]: false }));
    }
  };

  const start = (withDrawings: boolean) => onStart(withDrawings
    ? { planSrc: plan.src, planName: plan.name, elevationSrc: elev.src, elevationName: elev.name }
    : { planSrc: null, planName: null, elevationSrc: null, elevationName: null });

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#1a2530', letterSpacing: '.02em' }}>甍AI　屋根・雨樋積算</div>
        <div style={{ marginTop: 6, fontSize: 13, color: '#6b7885' }}>図面を入れて「積算開始」。読み込んだ図面を背景に、屋根・雨樋を確定して積算します。</div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <DropZone label="平面図" src={plan.src} name={plan.name} busy={busy.plan} error={err.plan}
          onPick={(f) => pick('plan', f)} onClear={() => { setPlan({ src: null, name: null }); setErr((e) => ({ ...e, plan: null })); }} />
        <DropZone label="立面図" src={elev.src} name={elev.name} busy={busy.elev} error={err.elev}
          onPick={(f) => pick('elev', f)} onClear={() => { setElev({ src: null, name: null }); setErr((e) => ({ ...e, elev: null })); }} />
      </div>

      <div style={{ textAlign: 'center', marginTop: 24 }}>
        <button onClick={() => start(true)} disabled={!plan.src && !elev.src}
          style={{
            fontSize: 17, fontWeight: 700, padding: '12px 44px', borderRadius: 10, border: 'none',
            color: '#fff', background: (plan.src || elev.src) ? '#1971c2' : '#b8c2cc',
            cursor: (plan.src || elev.src) ? 'pointer' : 'not-allowed', boxShadow: (plan.src || elev.src) ? '0 2px 10px rgba(25,113,194,.35)' : 'none',
          }}>
          積算開始 →
        </button>
        <div style={{ marginTop: 14 }}>
          <button onClick={() => start(false)}
            style={{ fontSize: 12, color: '#6b7885', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
            図面なしで手動で始める
          </button>
        </div>
      </div>

      <div style={{ marginTop: 26, padding: '12px 16px', background: '#f4f7fa', borderRadius: 10, fontSize: 12, color: '#6b7885', lineHeight: 1.7 }}>
        いまの一周目：図面を取り込み → 既存の Engine Studio で人が屋根・雨樋を確認・修正 → 数量確定 →（雨樋から）実見積と照合。
        図面からの自動提案はこの後の版で段階的に増やします。
      </div>
    </div>
  );
}
