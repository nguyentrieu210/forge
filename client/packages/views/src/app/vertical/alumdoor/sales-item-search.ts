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
    .split(/[\s_./\\-]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2);
  const normalizedWords = words.map(normalized);
  const aliases: Record<string, string[]> = {
    cua: ["cửa"], cuon: ["cuốn"], duc: ["đức"], uc: ["úc"],
    dai: ["đài"], loan: ["loan"], luoi: ["lưới"], nhom: ["nhôm"],
    kem: ["kẽm"], trang: ["trắng"], keo: ["kéo"], ray: ["ray"],
    tronbo: ["trọn bộ", "TRONBO"], tron: ["trọn"], bo: ["bộ"],
    xn: ["XN", "xanh ngọc"], vk: ["VK", "vân kẽm"], xlc: ["XLC"],
    dl: ["DL", "đài loan"], std: ["STD", "standard"], msk: ["MSK"],
  };
  const aliasTerms = normalizedWords.flatMap((word) => aliases[word] ?? []);
  const compoundAliasTerms = normalizedWords
    .slice(0, -1)
    .flatMap((word, index) => aliases[`${word}${normalizedWords[index + 1]}`] ?? []);
  const compact = normalized(raw).replace(/[^a-z0-9]+/g, "");
  const compactAliasTerms = aliases[compact] ?? [];
  const initials = normalizedWords.map((word) => word[0]).join("");

  return [...new Set([
    raw,
    normalized(raw),
    ...aliasTerms,
    ...compoundAliasTerms,
    ...compactAliasTerms,
    ...words,
    ...normalizedWords,
    compact,
    initials.length >= 2 ? initials : "",
  ].filter(Boolean))].slice(0, 18);
}
