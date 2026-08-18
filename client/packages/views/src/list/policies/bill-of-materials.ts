import { buildServerQuery } from "../filters.js";
import type { ListRuntimePolicy } from "./contract.js";

/**
 * BOM list shows `item` as a resolved Item label. The raw BOM document only stores
 * the Item key, so searching the visible text (for example "cửa") cannot match the
 * BOM row directly. Resolve the user's term against Item first, then filter BOMs by
 * the matching Item keys. If Item resolution returns nothing, fall back to the normal
 * BOM search so technical names such as DM-2026-0114 still work.
 */
export const billOfMaterialsListPolicy: ListRuntimePolicy = {
  resolveSearch: async (adapter, doctype, term) => {
    const matches = await adapter.searchLink("Item", term, {
      referenceDoctype: doctype,
      pageLength: 50,
    });
    return {
      values: [...new Set(matches.map((match) => String(match.value ?? "").trim()).filter(Boolean))],
    };
  },
  buildQuery: (meta, state, baseColumns, resolution) => {
    const linkedItems = state.q.trim() && resolution?.values.length ? resolution.values.slice(0, 50) : undefined;
    const query = buildServerQuery(meta, { ...state, q: linkedItems ? "" : state.q }, baseColumns);
    if (linkedItems) {
      const current = Array.isArray(query.filters) ? query.filters : [];
      query.filters = [...current, ["item", "in", linkedItems]];
    }
    return query;
  },
};
