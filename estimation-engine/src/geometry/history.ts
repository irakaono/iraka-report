// 甍AI 編集履歴（汎用）— Command 方式の Undo/Redo。全 Engine 共通。
//   UI は Model を直接書き換えない。reducer(model, command) が新しい Model を返し、履歴に積む。
//   → Human / AI(Recognizer) / Import はすべて「同じ Command」を dispatch する。Undo/Redo は無料。
export interface History<T> { past: T[]; present: T; future: T[]; }

export function initHistory<T>(present: T): History<T> { return { past: [], present, future: [] }; }

/** reducer で present を更新し、履歴に積む（future はクリア）。 */
export function dispatch<T, C>(h: History<T>, reducer: (m: T, c: C) => T, command: C): History<T> {
  const next = reducer(h.present, command);
  if (next === h.present) return h; // 変化なしなら積まない
  return { past: [...h.past, h.present], present: next, future: [] };
}

export function undo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  const prev = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  const next = h.future[0];
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
}

export const canUndo = <T>(h: History<T>): boolean => h.past.length > 0;
export const canRedo = <T>(h: History<T>): boolean => h.future.length > 0;
