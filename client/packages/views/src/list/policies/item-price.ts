import { buildServerQuery } from "../filters.js";
import type { ListRuntimePolicy } from "./contract.js";

export const itemPriceListPolicy: ListRuntimePolicy = {
  resolveSearch: async (adapter, doctype, term) => {
    const matches = await adapter.searchLink("Item", term, { referenceDoctype: doctype, pageLength: 50 });
    return { values: [...new Set(matches.map((match) => String(match.value ?? "").trim()).filter(Boolean))] };
  },
  buildQuery: (meta, state, baseColumns, resolution) => {
    const linkedCodes = state.q.trim() && resolution?.values.length ? resolution.values : undefined;
    const query = buildServerQuery(meta, { ...state, q: linkedCodes ? "" : state.q }, baseColumns);
    if (linkedCodes) {
      const current = Array.isArray(query.filters) ? query.filters : [];
      query.filters = [...current, ["item_code", "in", linkedCodes]];
    }
    return query;
  },
};
