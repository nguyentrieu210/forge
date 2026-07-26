/**
 * Print Format serializer (Builder serializer #3) — PrintFormatModel → Print Format doc (Jinja HTML).
 * Frappe: DocType "Print Format" { doc_type, print_format_type:"Jinja", standard:"No", html }.
 * THUẦN + test. HTML sinh từ block visible → Jinja an toàn (chỉ `{{ doc.<field> }}`, không script).
 */
import type { PrintFormatModel } from "./PrintFormatBuilder.js";

export interface PrintValidationResult {
  ok: boolean;
  issues: Array<{ severity: "error" | "warning"; code: string; message: string }>;
}

export function validatePrintFormat(m: PrintFormatModel): PrintValidationResult {
  const issues: PrintValidationResult["issues"] = [];
  if (!m.name || !String(m.name).trim()) issues.push({ severity: "error", code: "name", message: "Print Format cần tên" });
  if (!m.doc_type || !String(m.doc_type).trim()) issues.push({ severity: "error", code: "doc_type", message: "Print Format cần doc_type" });
  const visible = (m.blocks ?? []).filter((b) => b.visible);
  if (visible.length === 0) issues.push({ severity: "warning", code: "empty", message: "Chưa có field nào hiển thị" });
  return { ok: !issues.some((i) => i.severity === "error"), issues };
}

/** escape để tên field/label không phá HTML (dữ liệu render qua Jinja `{{ doc.x }}` — server escape value). */
function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** Sinh HTML Jinja từ block visible (fieldname → `{{ doc.<field> }}`). Không nhúng script/style động. */
export function printHtml(m: PrintFormatModel): string {
  const rows = (m.blocks ?? [])
    .filter((b) => b.visible)
    .map((b) => `  <tr><td class="label">${esc(b.label)}</td><td class="value">{{ doc.${esc(b.fieldname)} }}</td></tr>`)
    .join("\n");
  return `<table class="print-format">\n${rows}\n</table>`;
}

export interface PrintFormatPayload {
  doctype: "Print Format";
  name: string;
  doc_type: string;
  print_format_type: "Jinja";
  standard: "No";
  html: string;
}

export function serializePrintFormat(m: PrintFormatModel): PrintFormatPayload {
  return { doctype: "Print Format", name: m.name, doc_type: m.doc_type, print_format_type: "Jinja", standard: "No", html: printHtml(m) };
}
