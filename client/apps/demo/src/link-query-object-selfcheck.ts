import { strict as assert } from "node:assert";
import { buildLinkFilters, type DocField } from "@metaforge/core";

const field = (linkFilters: unknown): DocField => ({
  fieldname: "item_code",
  fieldtype: "Link",
  options: "Item",
  link_filters: JSON.stringify(linkFilters),
});

const salesItems = buildLinkFilters(field({ is_sales_item: 1, disabled: 0 }));
assert.deepEqual(
  salesItems,
  { is_sales_item: 1, disabled: 0 },
  "object-form sales filters must reach Link search instead of being silently discarded",
);

const contextual = buildLinkFilters(
  field({ company: "eval:doc.company", disabled: 0 }),
  { company: "Alumdoor" },
);
assert.deepEqual(contextual, { company: "Alumdoor", disabled: 0 });

const operator = buildLinkFilters(field({ item_group: ["in", ["Thành phẩm", "Dịch vụ"]] }));
assert.deepEqual(operator, { item_group: ["in", ["Thành phẩm", "Dịch vụ"]] });

const missingContext = buildLinkFilters(field({ company: "eval:doc.company" }), {});
assert.equal(missingContext, undefined);

console.log("  ✓ buildLinkFilters accepts object-form filters used by sales child grids");
