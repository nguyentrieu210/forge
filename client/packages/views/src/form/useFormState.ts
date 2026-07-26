/**
 * useFormState — form state nhẹ (useReducer): values + dirty + errors, seed từ doc.
 *  - RESET khi chuyển sang document khác (doc.name) hoặc doc được tải lại (doc.modified).
 *  - dirty CHÍNH XÁC: đổi field rồi đổi VỀ giá trị gốc ⇒ hết dirty.
 *  (RHF/Zod có thể phủ ở PHA 6; interface giữ nguyên để không phá renderer.)
 */
import { useCallback, useEffect, useReducer } from "react";
import type { Doc } from "@metaforge/core";

interface State {
  initial: Record<string, unknown>;
  values: Record<string, unknown>;
  dirty: Set<string>;
  errors: Record<string, string>;
}

type Action =
  | { t: "set"; field: string; value: unknown }
  | { t: "errors"; errors: Record<string, string> }
  | { t: "reset"; doc: Doc };

function equals(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  // so sánh mảng/obj (Table rows…) qua JSON — đủ cho form value
  if (typeof a === "object" && typeof b === "object" && a && b) {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  // "" và null/undefined coi như bằng (field trống)
  if ((a === "" || a == null) && (b === "" || b == null)) return true;
  return false;
}

function reducer(s: State, a: Action): State {
  switch (a.t) {
    case "set": {
      const dirty = new Set(s.dirty);
      if (equals(a.value, s.initial[a.field])) dirty.delete(a.field);
      else dirty.add(a.field);
      return { ...s, values: { ...s.values, [a.field]: a.value }, dirty };
    }
    case "errors":
      return { ...s, errors: a.errors };
    case "reset":
      return { initial: { ...a.doc }, values: { ...a.doc }, dirty: new Set(), errors: {} };
  }
}

export interface FormApi {
  values: Record<string, unknown>;
  errors: Record<string, string>;
  isDirty: boolean;
  setField: (field: string, value: unknown) => void;
  setErrors: (errors: Record<string, string>) => void;
  reset: (doc: Doc) => void;
  /** chỉ field đã đổi (+ name/modified) — để gửi update tối thiểu. */
  changedValues: () => Record<string, unknown>;
}

export function useFormState(doc: Doc): FormApi {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    initial: { ...doc },
    values: { ...doc },
    dirty: new Set<string>(),
    errors: {},
  }));

  // reset khi đổi document (name) hoặc tải lại (modified) — KHÔNG reset khi user đang gõ cùng doc.
  useEffect(() => {
    dispatch({ t: "reset", doc });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.name, doc.modified]);

  const setField = useCallback((field: string, value: unknown) => dispatch({ t: "set", field, value }), []);
  const setErrors = useCallback((errors: Record<string, string>) => dispatch({ t: "errors", errors }), []);
  const reset = useCallback((d: Doc) => dispatch({ t: "reset", doc: d }), []);
  const changedValues = useCallback(() => {
    const out: Record<string, unknown> = {};
    for (const f of state.dirty) out[f] = state.values[f];
    return out;
  }, [state.dirty, state.values]);

  return {
    values: state.values,
    errors: state.errors,
    isDirty: state.dirty.size > 0,
    setField,
    setErrors,
    reset,
    changedValues,
  };
}
