import { buildServerQuery } from "../filters.js";
import type { ListRuntimePolicy } from "./contract.js";

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLocaleLowerCase("vi")
    .trim();
}

/**
 * BOM list shows `item` as a resolved Item label, while the raw BOM row stores only
 * the Item key. Searching Item first and taking the first 50 hits is incomplete: a
 * common term such as "cửa" can match many Items, and the Items that actually have a
 * BOM may not be inside that first page.
 *
 * Resolve against the BOM universe instead: page through all BOM rows, resolve the
 * labels of exactly the linked Items used by those BOMs, and match the user's term
 * against BOM id + Item key + visible Item label. This keeps the search aligned with
 * what the table actually displays and is accent/case insensitive.
 */
export const billOfMaterialsListPolicy: ListRuntimePolicy = {
  resolveSearch: async (adapter, doctype, term) => {
    const needle = normalizeSearchText(term);
    if (!needle) return { values: [] };

    const bomRows: Array<{ name: string; item: string }> = [];
    const pageLength = 100;
    for (let limitStart = 0; ; limitStart += pageLength) {
      const page = await adapter.getList(doctype, {
        fields: ["name", "item"],
        orderBy: "name asc",
        limitStart,
        pageLength,
      });
      for (const row of page) {
        const name = String(row.name ?? "").trim();
        const item = String(row.item ?? "").trim();
        if (name) bomRows.push({ name, item });
      }
      if (page.length < pageLength) break;
    }

    const itemNames = [...new Set(bomRows.map((row) => row.item).filter(Boolean))];
    const labels = new Map<string, string>();
    for (let start = 0; start < itemNames.length; start += 200) {
      const resolved = await adapter.resolveDisplayValues(
        itemNames.slice(start, start + 200).map((name) => ({ doctype: "Item", name })),
      );
      for (const entry of resolved) labels.set(String(entry.name), String(entry.label ?? entry.name ?? ""));
    }

    const matchedBomNames = bomRows
      .filter((row) => normalizeSearchText(`${row.name} ${row.item} ${labels.get(row.item) ?? ""}`).includes(needle))
      .map((row) => row.name);

    return { values: [...new Set(matchedBomNames)] };
  },
  buildQuery: (meta, state, baseColumns, resolution) => {
    const matchedBomNames = state.q.trim() && resolution?.values.length ? resolution.values : undefined;
    const query = buildServerQuery(meta, { ...state, q: matchedBomNames ? "" : state.q }, baseColumns);
    if (matchedBomNames) {
      const current = Array.isArray(query.filters) ? query.filters : [];
      query.filters = [...current, ["name", "in", matchedBomNames.slice(0, 50)]];
    }
    return query;
  },
};
