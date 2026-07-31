// 甍AI v1.0 の入口画面。平面図・立面図をドロップ（PDF/画像）→「積算開始」で Studio へ。
//   ★ここは「使える入口」。完全自動認識ではなく、図面を取り込み → 既存 Studio で人が確認・修正 → 数量確定 の一周目。
//   PDF は1枚目を画像化して背景に使う（pdfjs を必要時だけ CDN から遅延ロード＝バンドルを太らせない。画像はオフラインでも動く）。
import { useRef, useState } from 'react';
import { inferScale, type ScaleHint } from '../geometry/scaleInference';
import { inferElevation, type ElevationHint } from '../geometry/elevationInference';
import { readElevation, type ElevationSpec } from '../geometry/recognizer';
import { coalesceTextItems, type RawGlyph } from '../geometry/pdfText';
import { extractSegments, type PdfOps, type OperatorList } from '../geometry/vectorReader';
import { wallFilter } from '../geometry/wallFilter';
import { traceOutline } from '../geometry/contourTrace';
import { wallCorners } from '../geometry/cornerSnap';
import type { FootprintCandidate } from '../geometry/footprint';

// pdf.js の textContent（グリフ単位のことがある）を語・数値トークンに結合して返す。
async function pageTokens(doc: any, pageNum: number) {
  const page = await doc.getPage(pageNum);
  const tc = await page.getTextContent();
  const glyphs: RawGlyph[] = (tc.items as any[])
    .filter((i) => i && typeof i.str === 'string' && Array.isArray(i.transform))
    .map((i) => ({ str: i.str as string, x: i.transform[4] as number, y: i.transform[5] as number, w: (i.width as number) || 0, fs: Math.hypot(i.transform[0], i.transform[1]) || 6 }));
  return coalesceTextItems(glyphs);
}

export interface DrawingSet {
  planSrc: string | null;
  planName: string | null;
  elevationSrc: string | null;
  elevationName: string | null;
  scaleHint?: ScaleHint | null;      // 平面図から推定した縮尺（提案・人が確認して確定）
  elevHint?: ElevationHint | null;   // 立面図から推定した勾配・軒の出（集計候補）
  elevReadings?: ElevationSpec[];    // 立面ごとの Reader 結果（R-2.5 見える化用）
  footprint?: FootprintCandidate | null; // 平面図から認識した Building Footprint Candidate（Phase E・下書きと角スナップの土台）
}

const RENDER_SCALE = 2; // renderDocPage の既定倍率と一致させる（pxPerMeter は画像px基準）

// 平面図ページのテキスト（座標つき）から縮尺を推定。取れなければ null。
async function extractScaleHint(doc: any, pageNum: number): Promise<ScaleHint | null> {
  try {
    const items = await pageTokens(doc, pageNum);  // グリフ結合済み（1文字ずつの図面でも "1/50"/"910" を復元）
    const hint = inferScale(items, RENDER_SCALE);
    return hint.pxPerMeter != null ? hint : null;
  } catch { return null; }
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
export type PageCategory = 'plan' | 'elevation' | 'roofplan' | 'framing' | 'section' | 'site' | 'schedule' | 'other';
export interface PageInfo { n: number; category: PageCategory; title: string }
export const CAT_LABEL: Record<PageCategory, string> = {
  plan: '平面図', elevation: '立面図', roofplan: '屋根伏図', framing: '伏図', section: '断面/矩計', site: '配置図', schedule: '建具/仕上/面積', other: 'その他',
};
function classifyPage(text: string): { category: PageCategory; title: string } {
  const t = text.replace(/\s+/g, '');
  const title = (t.match(/((?:[0-9０-９]{1,2}階|[東西南北]|小屋|基礎|地下|各階|R)?(?:平面詳細図|平面図|立面図|屋根伏図|小屋伏図|床伏図|基礎伏図|伏図|配置図|断面図|矩計図|展開図|面積表|求積図|建具表|仕上表))/) || [])[1] || '';
  let category: PageCategory = 'other';
  if (/立面図/.test(t)) category = 'elevation';               // 種別の優先順（平面図は generic なので最後）
  else if (/屋根伏図/.test(t)) category = 'roofplan';
  else if (/小屋伏図|床伏図|基礎伏図|伏図/.test(t)) category = 'framing';
  else if (/矩計図|断面図/.test(t)) category = 'section';
  else if (/配置図/.test(t)) category = 'site';
  else if (/建具表|仕上表|面積表|求積図/.test(t)) category = 'schedule';
  else if (/平面詳細図|平面図/.test(t)) category = 'plan';
  return { category, title: title || CAT_LABEL[category] };
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

// pdfjs.OPS（コード表）を Vector Reader が要る形へ。pdfjs を import しない純関数へ渡すため（vectorReader.ts と同じ契約）。
function opsOf(OPS: any): PdfOps {
  return {
    save: OPS.save, restore: OPS.restore, transform: OPS.transform, constructPath: OPS.constructPath,
    moveTo: OPS.moveTo, lineTo: OPS.lineTo, curveTo: OPS.curveTo, curveTo2: OPS.curveTo2, curveTo3: OPS.curveTo3,
    closePath: OPS.closePath, rectangle: OPS.rectangle,
  };
}

// 平面図ページ → Building Footprint Candidate（認識・Phase E）。
//   Recognizer 純関数（Vector Reader → wallFilter → traceOutline → wallCorners）を回し、
//   外形 polygon と 認識した壁角 corners を「描画した平面図画像のピクセル座標」で返す（＝背景と同座標系）。
//   ★壁が読めない/フォーマット非対応でも既存フローを壊さない：失敗は null（下書きは従来のプリセットになる）。
async function extractFootprint(doc: any, pageNum: number): Promise<FootprintCandidate | null> {
  try {
    const pdfjs = await getPdfjs();
    const page = await doc.getPage(pageNum);
    const opList = (await page.getOperatorList()) as OperatorList;
    const ex = extractSegments(opList, opsOf(pdfjs.OPS));
    const walls = wallFilter(ex.segments);
    const r = traceOutline(walls);
    if (!r || r.polygon.length < 4) return null;
    const corners = wallCorners(walls, r.polygon, { cluster: 12 });
    // PDF ユーザ空間 → 描画画像px（renderDocPage と同じ viewport = RENDER_SCALE）。背景に重なる座標へ。
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const toPx = (p: { x: number; y: number }) => { const v = viewport.convertToViewportPoint(p.x, p.y); return { x: v[0], y: v[1] }; };
    return { polygon: r.polygon.map(toPx), corners: corners.map(toPx), width: viewport.width, height: viewport.height, page: pageNum };
  } catch { return null; }
}

// 平面図：画像化＋縮尺推定＋外形認識をまとめて（PDFのみ。画像は手動較正へ）。
async function planWithHint(file: File): Promise<{ src: string; hint: ScaleHint | null; footprint: FootprintCandidate | null }> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) { const doc = await loadPdfDoc(file); const src = await renderDocPage(doc, 1); const hint = await extractScaleHint(doc, 1); const footprint = await extractFootprint(doc, 1); return { src, hint, footprint }; }
  return { src: await fileToImageSrc(file), hint: null, footprint: null };
}

// 立面図ページのテキスト（座標つき）から勾配・軒の出を推定。取れなければ null。
async function extractElev(doc: any, pageNum: number): Promise<{ hint: ElevationHint | null; readings: ElevationSpec[] }> {
  try {
    const items = await pageTokens(doc, pageNum);  // グリフ結合済み
    const hint = inferElevation(items);
    const readings = readElevation(items);          // 立面ごとの Reader 結果
    return { hint: (hint.pitch != null || hint.overhang != null) ? hint : null, readings };
  } catch { return { hint: null, readings: [] }; }
}
async function elevWithHint(file: File): Promise<{ src: string; hint: ElevationHint | null; readings: ElevationSpec[] }> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) { const doc = await loadPdfDoc(file); const src = await renderDocPage(doc, 1); const { hint, readings } = await extractElev(doc, 1); return { src, hint, readings }; }
  return { src: await fileToImageSrc(file), hint: null, readings: [] };
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
  const [planHint, setPlanHint] = useState<ScaleHint | null>(null); // 平面図から推定した縮尺（提案）
  const [elevHint, setElevHint] = useState<ElevationHint | null>(null); // 立面図から推定した勾配・軒の出（集計候補）
  const [elevReadings, setElevReadings] = useState<ElevationSpec[]>([]); // 立面ごとの Reader 結果（R-2.5）
  const [planFootprint, setPlanFootprint] = useState<FootprintCandidate | null>(null); // 平面図から認識した外形（Phase E）
  const extractInputRef = useRef<HTMLInputElement>(null);

  // 指定ページを描画して 平面図/立面図 スロットへ。
  const selectPage = async (which: 'plan' | 'elev', doc: any, fileName: string, page: PageInfo) => {
    setBusy((b) => ({ ...b, [which]: true }));
    try {
      const src = await renderDocPage(doc, page.n);
      const name = `${fileName} p${page.n}${page.title && page.title !== 'その他' ? '（' + page.title + '）' : ''}`;
      if (which === 'plan') { setPlan({ src, name }); setPlanPage(page.n); setPlanHint(await extractScaleHint(doc, page.n)); setPlanFootprint(await extractFootprint(doc, page.n)); }
      else { setElev({ src, name }); setElevPage(page.n); const ev = await extractElev(doc, page.n); setElevHint(ev.hint); setElevReadings(ev.readings); }
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
      if (which === 'plan') {
        const { src, hint, footprint } = await planWithHint(file);
        setPlan({ src, name: file.name }); setPlanHint(hint); setPlanFootprint(footprint);
      } else {
        const { src, hint, readings } = await elevWithHint(file);
        setElev({ src, name: file.name }); setElevHint(hint); setElevReadings(readings);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr((prev) => ({ ...prev, [which]: /pdf/i.test(msg) || msg.includes('import') ? 'PDF読込に失敗（オフライン時はPDF不可）。画像で入れてください' : msg }));
    } finally {
      setBusy((b) => ({ ...b, [which]: false }));
    }
  };

  const start = (withDrawings: boolean) => onStart(withDrawings
    ? { planSrc: plan.src, planName: plan.name, elevationSrc: elev.src, elevationName: elev.name, scaleHint: planHint, elevHint, elevReadings, footprint: planFootprint }
    : { planSrc: null, planName: null, elevationSrc: null, elevationName: null, scaleHint: null, elevHint: null, elevReadings: [], footprint: null });

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#1a2530', letterSpacing: '.02em' }}>甍AI　屋根・雨樋積算</div>
        <div style={{ marginTop: 6, fontSize: 13, color: '#6b7885' }}>図面を入れて「積算開始」。読み込んだ図面を背景に、屋根・雨樋を確定して積算します。</div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <DropZone label="平面図" src={plan.src} name={plan.name} busy={busy.plan} error={err.plan}
          onPick={(f) => pick('plan', f)} onClear={() => { setPlan({ src: null, name: null }); setErr((e) => ({ ...e, plan: null })); setPlanPage(null); setPlanHint(null); setPlanFootprint(null); }} />
        <DropZone label="立面図" src={elev.src} name={elev.name} busy={busy.elev} error={err.elev}
          onPick={(f) => pick('elev', f)} onClear={() => { setElev({ src: null, name: null }); setErr((e) => ({ ...e, elev: null })); setElevPage(null); setElevHint(null); setElevReadings([]); }} />
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
              {extract.fileName}：{extract.pages.length}ページ解析 — この案件には{' '}
              {(['plan', 'elevation', 'roofplan', 'framing', 'section', 'site', 'schedule', 'other'] as PageCategory[])
                .map((c) => ({ c, n: extract.pages.filter((p) => p.category === c).length }))
                .filter((x) => x.n > 0)
                .map((x) => `${CAT_LABEL[x.c]}${x.n}枚`).join('・')}
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

      {planHint && planHint.pxPerMeter != null && (
        <div style={{ marginTop: 12, padding: '8px 14px', background: '#ebfbee', border: '1px solid #b2f2bb', borderRadius: 10, fontSize: 13, color: '#2b8a3e', fontWeight: 700 }}>
          📏 平面図から縮尺を検出：
          {planHint.noteD ? `1/${planHint.noteD}` : '寸法から推定'}
          {planHint.source === 'note+dimension' && planHint.agree === true ? '（縮尺表記と寸法が一致）' : planHint.source === 'note+dimension' && planHint.agree === false ? '（表記と寸法にズレあり・要確認）' : planHint.source === 'dimension' ? '（寸法チェーンから）' : ''}
          <span style={{ fontWeight: 500, color: '#495057' }}>　→ 積算開始後に「この縮尺で設定」で確定できます（手動2点も可）。</span>
        </div>
      )}

      {planFootprint && (
        <div style={{ marginTop: 12, padding: '8px 14px', background: '#e7f5ff', border: '1px solid #a5d8ff', borderRadius: 10, fontSize: 13, color: '#1971c2', fontWeight: 700 }}>
          🏠 平面図から建物の外形を認識しました（{planFootprint.polygon.length}頂点）
          <span style={{ fontWeight: 500, color: '#495057' }}>　→ 積算開始後、その形で下書きが置かれます。角をドラッグすると壁の角に吸着します。</span>
        </div>
      )}

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
        使い方：図面を取り込み →「積算開始」→ 屋根・雨樋を確認・修正 → 数量が自動集計され、見積Excelを出力できます。
        図面からの自動読み取り（自動提案）はこの後の版で段階的に増やしていきます。
      </div>
    </div>
  );
}
