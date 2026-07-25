// 甍AI Estimation OS — 保存基盤（e0.3.3）
// 「半年後に開いても同じ状態」を満たす。保存の真実は SavedProject（画像は dataURL 埋め込み）。
//   - 案件ファイル(.iraka.json): 明示的な 保存/開く（自己完結・持ち運び可）
//   - IndexedDB: 自動保存（起動時に復元）＋ 世代バックアップ（数世代キープ）
// 思想は不変: vertices=真実 / Quantity=派生（保存しない）。ここは「入れ物」の永続化のみ。

import type { Drawing, Measurement, Project, SavedDrawing, SavedProject } from './types';
import { PROJECT_SCHEMA_VERSION } from './types';

// ── dataURL ↔ HTMLImageElement ──────────────────────────────
export function imageFromSrc(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image decode error'));
    img.src = src;
  });
}

// ── シリアライズ / デシリアライズ ────────────────────────────
export function toSaved(project: Project, measurements: Measurement[], settings?: { scale?: number }): SavedProject {
  const drawings: SavedDrawing[] = project.drawings.map((d) => ({
    drawingId: d.drawingId, name: d.name, sourceName: d.sourceName,
    page: d.page, pageCount: d.pageCount, src: d.src,
  }));
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectName: project.name,
    drawings,
    measurements,
    settings,
    metadata: { savedAt: new Date().toISOString(), app: '甍AI 拾いエディタ' },
  };
}

export async function fromSaved(saved: SavedProject): Promise<{ project: Project; measurements: Measurement[]; settings?: { scale?: number } }> {
  const drawings: Drawing[] = [];
  for (const sd of saved.drawings || []) {
    try {
      const image = await imageFromSrc(sd.src);
      drawings.push({ ...sd, image });
    } catch {
      /* 壊れた画像はスキップ（他の図面は復元する） */
    }
  }
  const project: Project = {
    schemaVersion: saved.schemaVersion ?? PROJECT_SCHEMA_VERSION,
    name: saved.projectName || '無題の案件',
    drawings,
  };
  return { project, measurements: saved.measurements || [], settings: saved.settings };
}

// ── 案件ファイル(.iraka.json) 書き出し / 読み込み ─────────────
export function downloadProjectFile(saved: SavedProject): void {
  const safe = (saved.projectName || '案件').replace(/[\\/:*?"<>|]/g, '_');
  const blob = new Blob([JSON.stringify(saved)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe}.iraka.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function readProjectFile(file: File): Promise<SavedProject> {
  const text = await file.text();
  const obj = JSON.parse(text) as SavedProject;
  if (!obj || !Array.isArray(obj.drawings) || !Array.isArray(obj.measurements)) {
    throw new Error('案件ファイルの形式が不正です');
  }
  return obj;
}

// ── IndexedDB（自動保存＋世代バックアップ） ───────────────────
const DB_NAME = 'iraka.db.v1';
const STORE_AUTOSAVE = 'autosave'; // key 'current' に最新
const STORE_BACKUP = 'backups';    // key = savedAt(ISO)
const AUTOSAVE_KEY = 'current';
const MAX_BACKUPS = 5;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB 未対応')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_AUTOSAVE)) db.createObjectStore(STORE_AUTOSAVE);
      if (!db.objectStoreNames.contains(STORE_BACKUP)) db.createObjectStore(STORE_BACKUP);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// 自動保存（最新を上書き）
export async function autosave(saved: SavedProject): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_AUTOSAVE, 'readwrite');
    tx.objectStore(STORE_AUTOSAVE).put(saved, AUTOSAVE_KEY);
    await txDone(tx);
    db.close();
  } catch { /* プライベートモード等では無視（案件ファイル保存があるので致命ではない） */ }
}

export async function loadAutosave(): Promise<SavedProject | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_AUTOSAVE, 'readonly');
    const req = tx.objectStore(STORE_AUTOSAVE).get(AUTOSAVE_KEY);
    const val = await new Promise<any>((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
    db.close();
    return (val as SavedProject) || null;
  } catch { return null; }
}

// 世代バックアップ（savedAt をキーに追加、古いものを間引く）
export async function pushBackup(saved: SavedProject): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_BACKUP, 'readwrite');
    const store = tx.objectStore(STORE_BACKUP);
    const key = saved.metadata?.savedAt || new Date().toISOString();
    store.put(saved, key);
    // 古いバックアップを間引く
    const keysReq = store.getAllKeys();
    keysReq.onsuccess = () => {
      const keys = (keysReq.result as IDBValidKey[]).map(String).sort();
      const excess = keys.length - MAX_BACKUPS;
      for (let i = 0; i < excess; i++) store.delete(keys[i]);
    };
    await txDone(tx);
    db.close();
  } catch { /* 無視 */ }
}

export async function listBackups(): Promise<{ id: string; savedAt: string; projectName: string }[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_BACKUP, 'readonly');
    const store = tx.objectStore(STORE_BACKUP);
    const all = await new Promise<any[]>((res, rej) => {
      const r = store.getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error);
    });
    db.close();
    return all
      .map((s: SavedProject) => ({ id: s.metadata?.savedAt || '', savedAt: s.metadata?.savedAt || '', projectName: s.projectName }))
      .filter((x) => x.id)
      .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1)); // 新しい順
  } catch { return []; }
}

export async function getBackup(id: string): Promise<SavedProject | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_BACKUP, 'readonly');
    const req = tx.objectStore(STORE_BACKUP).get(id);
    const val = await new Promise<any>((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
    db.close();
    return (val as SavedProject) || null;
  } catch { return null; }
}
