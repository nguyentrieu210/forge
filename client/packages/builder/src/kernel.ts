/**
 * BuilderKernel — lõi chung cho mọi builder: model + history (undo/redo) + serialize.
 * Pure (test được không cần React). Hook useBuilder bọc cho component.
 */
import { useCallback, useReducer } from "react";

/** History bất biến: past / present / future. */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  constructor(private present: T) {}

  get(): T {
    return this.present;
  }
  set(next: T): void {
    this.past.push(this.present);
    this.present = next;
    this.future = [];
  }
  undo(): boolean {
    const prev = this.past.pop();
    if (prev === undefined) return false;
    this.future.unshift(this.present);
    this.present = prev;
    return true;
  }
  redo(): boolean {
    const nxt = this.future.shift();
    if (nxt === undefined) return false;
    this.past.push(this.present);
    this.present = nxt;
    return true;
  }
  canUndo(): boolean {
    return this.past.length > 0;
  }
  canRedo(): boolean {
    return this.future.length > 0;
  }
}

// ---- React hook (immutable snapshot state, tránh mutate History trong render) ----

interface HState<T> {
  past: T[];
  present: T;
  future: T[];
}
type HAction<T> =
  | { t: "set"; next: T }
  | { t: "update"; fn: (cur: T) => T }
  | { t: "undo" }
  | { t: "redo" }
  | { t: "reset"; value: T };

function hreducer<T>(s: HState<T>, a: HAction<T>): HState<T> {
  switch (a.t) {
    case "set":
      return { past: [...s.past, s.present], present: a.next, future: [] };
    case "update":
      return { past: [...s.past, s.present], present: a.fn(s.present), future: [] };
    case "undo": {
      if (s.past.length === 0) return s;
      const present = s.past[s.past.length - 1]!;
      return { past: s.past.slice(0, -1), present, future: [s.present, ...s.future] };
    }
    case "redo": {
      if (s.future.length === 0) return s;
      const present = s.future[0]!;
      return { past: [...s.past, s.present], present, future: s.future.slice(1) };
    }
    case "reset":
      return { past: [], present: a.value, future: [] };
  }
}

export interface Builder<T> {
  model: T;
  set: (next: T) => void;
  update: (fn: (cur: T) => T) => void;
  undo: () => void;
  redo: () => void;
  reset: (value: T) => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useBuilder<T>(initial: T): Builder<T> {
  const [state, dispatch] = useReducer(hreducer<T>, { past: [], present: initial, future: [] });
  const set = useCallback((next: T) => dispatch({ t: "set", next }), []);
  const update = useCallback((fn: (cur: T) => T) => dispatch({ t: "update", fn }), []);
  return {
    model: state.present,
    set,
    update,
    undo: useCallback(() => dispatch({ t: "undo" }), []),
    redo: useCallback(() => dispatch({ t: "redo" }), []),
    reset: useCallback((value: T) => dispatch({ t: "reset", value }), []),
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
