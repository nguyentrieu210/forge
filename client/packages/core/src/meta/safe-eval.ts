/**
 * safeEval — evaluator ALLOWLIST cho biểu thức Frappe `depends_on`/`eval:` (P0-06, rule #14).
 * KHÔNG dùng `new Function`/`eval`. Parser recursive-descent chỉ hỗ trợ tập con AN TOÀN:
 *   literal (số, chuỗi, true/false/null, mảng) · doc/parent + member (.f / ['f'] / .length) ·
 *   toán tử ! && || == === != !== < > <= >= + - · ngoặc · hàm whitelist (in_list/cint/flt/strip).
 * Cú pháp/định danh/hàm NGOÀI allowlist ⇒ ném lỗi (caller hiện diagnostic + coi điều kiện = false).
 * KHÔNG truy cập global, prototype, gọi hàm tuỳ ý, gán, hay member trên object thường (chỉ doc/parent).
 */

export interface EvalScope {
  doc: Record<string, unknown>;
  parent?: Record<string, unknown>;
}

class ParseError extends Error {}

// ── tokenizer ────────────────────────────────────────────────────────────────
type Tok = { t: "num" | "str" | "id" | "op" | "punct"; v: string };
const OPS = ["===", "!==", "==", "!=", "<=", ">=", "&&", "||", "<", ">", "!", "+", "-"];

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const isIdStart = (c: string) => /[A-Za-z_$]/.test(c);
  const isId = (c: string) => /[A-Za-z0-9_$]/.test(c);
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"' || c === "'") {
      const q = c; let s = ""; i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === "\\") { s += src[i + 1] ?? ""; i += 2; } else { s += src[i]; i++; }
      }
      if (src[i] !== q) throw new ParseError("chuỗi chưa đóng");
      i++; out.push({ t: "str", v: s }); continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      let n = ""; while (i < src.length && /[0-9.]/.test(src[i]!)) { n += src[i]; i++; }
      out.push({ t: "num", v: n }); continue;
    }
    if (isIdStart(c)) {
      let s = ""; while (i < src.length && isId(src[i]!)) { s += src[i]; i++; }
      out.push({ t: "id", v: s }); continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (op) { out.push({ t: "op", v: op }); i += op.length; continue; }
    if ("()[].,".includes(c)) { out.push({ t: "punct", v: c }); i++; continue; }
    throw new ParseError(`ký tự không hỗ trợ: '${c}'`);
  }
  return out;
}

// ── whitelist hàm ────────────────────────────────────────────────────────────
const FUNCS: Record<string, (args: unknown[]) => unknown> = {
  in_list: (a) => Array.isArray(a[0]) ? (a[0] as unknown[]).includes(a[1]) : false,
  cint: (a) => { const n = parseInt(String(a[0] ?? ""), 10); return Number.isNaN(n) ? 0 : n; },
  flt: (a) => { const n = parseFloat(String(a[0] ?? "")); return Number.isNaN(n) ? 0 : n; },
  strip: (a) => String(a[0] ?? "").trim(),
};

// ── parser (recursive descent) ───────────────────────────────────────────────
function parse(toks: Tok[], scope: EvalScope): unknown {
  let p = 0;
  const peek = () => toks[p];
  const eat = (v?: string) => { const t = toks[p]; if (v && (!t || t.v !== v)) throw new ParseError(`mong '${v}'`); p++; return t; };

  function or(): unknown { let l = and(); while (peek()?.v === "||") { eat(); const r = and(); l = truthy(l) ? l : r; } return l; }
  function and(): unknown { let l = eq(); while (peek()?.v === "&&") { eat(); const r = eq(); l = truthy(l) ? r : l; } return l; }
  function eq(): unknown {
    let l = cmp();
    while (["==", "===", "!=", "!=="].includes(peek()?.v ?? "")) {
      const o = eat()!.v; const r = cmp();
      // eslint-disable-next-line eqeqeq
      l = o === "==" ? l == r : o === "===" ? l === r : o === "!=" ? l != r : l !== r;
    }
    return l;
  }
  function cmp(): unknown {
    let l = add();
    while (["<", ">", "<=", ">="].includes(peek()?.v ?? "")) {
      const o = eat()!.v; const r = add(); const a = l as number, b = r as number;
      l = o === "<" ? a < b : o === ">" ? a > b : o === "<=" ? a <= b : a >= b;
    }
    return l;
  }
  function add(): unknown {
    let l = unary();
    while (["+", "-"].includes(peek()?.v ?? "")) {
      const o = eat()!.v; const r = unary();
      l = o === "+" ? (l as number) + (r as number) : (l as number) - (r as number);
    }
    return l;
  }
  function unary(): unknown {
    if (peek()?.v === "!") { eat(); return !truthy(unary()); }
    if (peek()?.v === "-") { eat(); return -(unary() as number); } // số âm / phủ định (M2)
    if (peek()?.v === "+") { eat(); return +(unary() as number); }
    return postfix();
  }
  function postfix(): unknown {
    let v = primary();
    for (;;) {
      if (peek()?.v === ".") { eat(); const id = eat(); if (id?.t !== "id") throw new ParseError("member sau '.'"); v = member(v, id.v); }
      else if (peek()?.v === "[") { eat(); const k = or(); eat("]"); v = member(v, String(k)); }
      else break;
    }
    return v;
  }
  function primary(): unknown {
    const t = peek();
    if (!t) throw new ParseError("biểu thức trống");
    if (t.t === "num") { eat(); return Number(t.v); }
    if (t.t === "str") { eat(); return t.v; }
    if (t.v === "(") { eat(); const v = or(); eat(")"); return v; }
    if (t.v === "[") { eat(); const arr: unknown[] = []; if (peek()?.v !== "]") { arr.push(or()); while (peek()?.v === ",") { eat(); arr.push(or()); } } eat("]"); return arr; }
    if (t.t === "id") {
      eat();
      if (t.v === "true") return true;
      if (t.v === "false") return false;
      if (t.v === "null" || t.v === "undefined") return null;
      // gọi hàm whitelist?
      if (peek()?.v === "(") {
        eat(); const args: unknown[] = []; if (peek()?.v !== ")") { args.push(or()); while (peek()?.v === ",") { eat(); args.push(or()); } } eat(")");
        const fn = FUNCS[t.v]; if (!fn) throw new ParseError(`hàm không cho phép: ${t.v}`);
        return fn(args);
      }
      if (t.v === "doc") return scope.doc;
      if (t.v === "parent") return scope.parent ?? {};
      throw new ParseError(`định danh không cho phép: ${t.v} (chỉ doc/parent)`);
    }
    throw new ParseError(`token bất ngờ: ${t.v}`);
  }

  const result = or();
  if (p < toks.length) throw new ParseError(`dư token: '${toks[p]!.v}'`);
  return result;
}

/** member an toàn: chỉ đọc property own trên object/array/chuỗi (KHÔNG prototype/hàm). */
function member(obj: unknown, key: string): unknown {
  if (obj == null) return undefined;
  if (Array.isArray(obj)) {
    if (key === "length") return obj.length;
    const i = Number(key); return Number.isInteger(i) ? obj[i] : undefined;
  }
  if (typeof obj === "string") { if (key === "length") return obj.length; const i = Number(key); return Number.isInteger(i) ? obj[i] : undefined; }
  if (typeof obj === "object") {
    // chỉ property own (chặn __proto__/constructor/prototype)
    if (key === "__proto__" || key === "constructor" || key === "prototype") return undefined;
    return Object.prototype.hasOwnProperty.call(obj, key) ? (obj as Record<string, unknown>)[key] : undefined;
  }
  return undefined;
}

function truthy(v: unknown): boolean { return Array.isArray(v) ? v.length > 0 : Boolean(v); }

/** Đánh giá biểu thức allowlist. Ném ParseError nếu cú pháp/định danh không hỗ trợ. */
export function safeEval(expr: string, scope: EvalScope): unknown {
  // ERPNext viết depends_on theo kiểu câu lệnh JS, hay có dấu ';' ở cuối — vd Warehouse dùng
  // `eval:(!doc.is_group);`. Đây là biểu thức HỢP LỆ, chỉ thừa dấu kết câu, nhưng tokenizer coi ';'
  // là ký tự lạ và ném lỗi ⇒ field mất luôn khả năng ẩn/hiện theo điều kiện. Cắt dấu ';' thừa ở
  // cuối (chỉ ở CUỐI — ';' ở giữa vẫn là nhiều câu lệnh, vẫn phải từ chối).
  return parse(tokenize(expr.trim().replace(/;+\s*$/, "")), scope);
}
