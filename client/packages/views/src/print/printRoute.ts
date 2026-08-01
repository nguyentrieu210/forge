/** Builds the canonical print-preview URL used by every runtime shell. */
export function buildPrintPath(doctype: string, name: string, format?: string): string {
  const path = `/print/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`;
  return format ? `${path}?format=${encodeURIComponent(format)}` : path;
}
