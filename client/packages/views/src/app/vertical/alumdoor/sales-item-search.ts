function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function normalized(value: unknown): string {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLocaleLowerCase("vi");
}

/**
 * Build the server queries used by the sales-item Link field.
 *
 * An empty query is intentional: LinkCombobox sends it when the popover opens so
 * the first page can be shown before the user types. Keep that one empty value
 * instead of filtering it out with the normalized search variants.
 */
export function salesItemSearchTerms(query: unknown): string[] {
  const raw = text(query);
  if (!raw) return [""];

  const words = raw
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2);

  return [...new Set([
    raw,
    normalized(raw),
    ...words,
    ...words.map(normalized),
  ].filter(Boolean))].slice(0, 8);
}
