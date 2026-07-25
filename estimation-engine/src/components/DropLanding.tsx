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

// pdfjs は初回だけ CDN から動的 import（バンドルに含めない・画像はオフラインでも動く）。
const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';

let _pdfjs: any = null;
async function getPdfjs(): Promise<any> {
  if (_pdfjs) return _pdfjs;
  const spec = PDFJS_CDN; // 変数経由で TS のモジュール解決(TS2307)を回避。実行時に URL から動的 import。
  const mod: any = await import(/* @vite-ignore */ spec);
  mod.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  _pdfjs = mod;
  return mod;
}
async function loadPdfDoc(file: File): Promise<any> {
  const pdfjs = await getPdfjs();
  const data = await file.arrayBuffer();
  return pdfjs.getDocument({ data }).promise;
}
async function renderDocPage(doc: any, pageNum: number, scale = 2): Promise<string> {
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context 取得失敗');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/png');
}

// ── 複数ページPDFから 平面図/立面図 を自動抽出：各ページのテキスト層からタイトルを読み分類する ──
export type PageCategory = 'plan' | 'elevation' | 'roofplan' | 'other';
export interface PageInfo { n: number; category: PageCategory; title: string }
function classifyPage(text: string): { category: PageCategory; title: string } {
  const t = text.replace(/\s+/g, '');
  const title = (t.match(/((?:[0-9０-９]{1,2}階|[東西南北]|小屋|基礎|地下|各階|R)?(?:平面詳細図|平面図|立面図|屋根伏図|小屋伏図|床伏図|基礎伏図|伏図|配置図|断面図|矩計図|展開図|面積表|求積図))/) || [])[1] || '';
  let category: PageCategory = 'other';
  if (/立面図/.test(t)) category = 'elevation';
  else if (/屋根伏図/.test(t)) category = 'roofplan';
  else if (/平面図|平面詳細図/.test(t)) category = 'plan';
  return { category, title: title || (category === 'other' ? 'その他' : category) };
}
async function analyzeDoc(doc: any): Promise<PageInfo[]> {
  const pages: PageInfo[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    const text = (tc.items as any[]).map((i) => (i.str || '')).join(' ');
    const { category, title } = classifyPage(text);
    pages.push({ n, category, title });
  }
  return pages;
}

async function fileToImageSrc(file: File): Promise<string> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) { const doc = await loadPdfDoc(file); return renderDocPage(doc, 1); }
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
  // 複数ページPDFからの自動抽出
  const [extract, setExtract] = useState<{ fileName: string; pages: PageInfo[]; doc: any } | null>(null);
  const [extractBusy, setExtractBusy] = useState(false);
  const [extractErr, setExtractErr] = useState<string | null>(null);
  const [planPage, setPlanPage] = useState<number | null>(null);
  const [elevPage, setElevPage] = useState<number | null>(null);
  const extractInputRef = useRef<HTMLInputElement>(null);

  // 指定ページを描画して 平面図/立面図 スロットへ。
  const selectPage = async (which: 'plan' | 'elev', doc: any, fileName: string, page: PageInfo) => {
    setBusy((b) => ({ ...b, [which]: true }));
    try {
      const src = await renderDocPage(doc, page.n);
      const name = `${fileName} p${page.n}${page.title && page.title !== 'その他' ? '（' + page.title + '）' : ''}`;
      if (which === 'plan') { setPlan({ src, name }); setPlanPage(page.n); } else { setElev({ src, name }); setElevPage(page.n); }
    } catch {
      setErr((prev) => ({ ...prev, [which]: '該当ページの描画に失敗' }));
    } finally { setBusy((b) => ({ ...b, [which]: false })); }
  };

  // 複数ページPDFを解析→平面図・立面図を自動検出して割り当て。
  const onExtractFile = async (file: File) => {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) { setExtractErr('自動抽出はPDFのみ対応（画像は左の枠へ）'); return; }
    setExtractBusy(true); setExtractErr(null);
    try {
      const doc = await loadPdfDoc(file);
      const pages = await analyzeDoc(doc);
      setExtract({ fileName: file.name, pages, doc });
      const planCand = pages.find((p) => p.category === 'plan') || pages.find((p) => p.category === 'roofplan');
      const elevCand = pages.find((p) => p.category === 'elevation');
      if (planCand) await selectPage('plan', doc, file.name, planCand);
      if (elevCand) await selectPage('elev', doc, file.name, elevCand);
      if (!planCand && !elevCand) setExtractErr('平面図・立面図を自動検出できませんでした。下でページを手動選択してください');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setExtractErr(/import/i.test(msg) ? 'PDF解析に失敗（オフライン時は自動抽出不可）' : msg);
    } finally { setExtractBusy(false); }
  };

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
          onPick={(f) => pick('plan', f)} onClear={() => { setPlan({ src: null, name: null }); setErr((e) => ({ ...e, plan: null })); setPlanPage(null); }} />
        <DropZone label="立面図" src={elev.src} name={elev.name} busy={busy.elev} error={err.elev}
          onPick={(f) => pick('elev', f)} onClear={() => { setElev({ src: null, name: null }); setErr((e) => ({ ...e, elev: null })); setElevPage(null); }} />
      </div>

      {/* 複数ページPDFから自動抽出 */}
      <div style={{ marginTop: 14 }}>
        <div
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onExtractFile(f); }}
          onClick={() => extractInputRef.current?.click()}
          style={{ border: '2px dashed #b9a3e3', borderRadius: 10, background: '#faf8ff', padding: '12px 16px', cursor: 'pointer', textAlign: 'center' }}
        >
          <input ref={extractInputRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onExtractFile(f); e.target.value = ''; }} />
          {extractBusy
            ? <span style={{ color: '#5f3dc4', fontWeight: 600 }}>解析中…（各ページのタイトルを読んでいます）</span>
            : <span style={{ color: '#5f3dc4', fontWeight: 700 }}>📄 確認申請図面など（複数ページPDF）をドロップ → 平面図・立面図を自動抽出</span>}
          {extractErr && <div style={{ marginTop: 6, fontSize: 12, color: '#e03131' }}>⚠ {extractErr}</div>}
        </div>
        {extract && (
          <div style={{ marginTop: 10, padding: '10px 14px', background: '#f5f2ff', borderRadius: 10, fontSize: 12 }}>
            <div style={{ color: '#5f3dc4', fontWeight: 700, marginBottom: 8 }}>
              {extract.fileName}：{extract.pages.length}ページ解析（平面{extract.pages.filter((p) => p.category === 'plan').length}・立面{extract.pages.filter((p) => p.category === 'elevation').length}・屋根伏図{extract.pages.filter((p) => p.category === 'roofplan').length} 検出）
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <label style={{ color: '#495057' }}>平面図ページ：{' '}
                <select value={planPage ?? ''} onChange={(e) => { const n = Number(e.target.value); const pg = extract.pages.find((p) => p.n === n); if (pg) selectPage('plan', extract.doc, extract.fileName, pg); }}>
                  <option value="">選択</option>
                  {extract.pages.map((p) => <option key={p.n} value={p.n}>p{p.n} {p.title}</option>)}
                </select>
              </label>
              <label style={{ color: '#495057' }}>立面図ページ：{' '}
                <select value={elevPage ?? ''} onChange={(e) => { const n = Number(e.target.value); const pg = extract.pages.find((p) => p.n === n); if (pg) selectPage('elev', extract.doc, extract.fileName, pg); }}>
                  <option value="">選択</option>
                  {extract.pages.map((p) => <option key={p.n} value={p.n}>p{p.n} {p.title}</option>)}
                </select>
              </label>
            </div>
          </div>
        )}
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
