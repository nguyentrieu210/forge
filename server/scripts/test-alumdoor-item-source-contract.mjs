#!/usr/bin/env node
import {
  ITEM_SOURCE_ALIASES,
  ITEM_SOURCE_CONTEXTUAL_COLLISIONS,
  ITEM_SOURCE_ROLES,
  assertAlumdoorItemSourceContract,
  classifyAlumdoorItemSourceCode,
} from "./lib/alumdoor-item-source-contract.mjs";

assertAlumdoorItemSourceContract();

function expect(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected=${expected} actual=${actual}`);
}

let result = classifyAlumdoorItemSourceCode("NvL-01/A_b");
expect(result.status, "source", "unknown source identity status");
expect(result.canonical_item_code, "NvL-01/A_b", "unknown source identity must preserve exact code");

result = classifyAlumdoorItemSourceCode("NVL-TD-AL501N VK");
expect(result.status, "blocked", "alias without source role must fail closed");
expect(result.reason, "source_role_required_for_alias", "alias without source role reason");

result = classifyAlumdoorItemSourceCode("NVL-TD-AL501N VK", { source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE });
expect(result.status, "alias", "audited BOM alias status");
expect(result.canonical_item_code, "NVL-AL501-VK", "audited BOM alias target");
expect(result.source_code_original, "NVL-TD-AL501N VK", "audited BOM alias trace");

result = classifyAlumdoorItemSourceCode("RON-DD", { source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT });
expect(result.status, "source", "numbered product identity wins over BOM alias table");
expect(result.canonical_item_code, "RON-DD", "numbered product code must remain exact");

result = classifyAlumdoorItemSourceCode("TP-BUOMINOX", { source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT });
expect(result.status, "source", "sellable TP-BUOMINOX must not collapse into stock NVL code");
expect(result.canonical_item_code, "TP-BUOMINOX", "sellable TP-BUOMINOX identity");

result = classifyAlumdoorItemSourceCode("TRU-TP_KHONGBDK_TANKER-ALUMAX", { source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT });
expect(result.status, "excluded", "TRU adjustment exclusion");
expect(result.canonical_item_code, "", "TRU adjustment must not become Item");

result = classifyAlumdoorItemSourceCode("PHUTHU-UC<7m²", { source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT });
expect(result.status, "excluded", "PHUTHU exclusion");
expect(result.canonical_item_code, "", "PHUTHU must not become Item");

result = classifyAlumdoorItemSourceCode("NVL-LD-3LD", { source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE });
expect(result.status, "excluded", "aggregate BOM helper exclusion");
expect(result.reason, "aggregate_bom_helper", "aggregate BOM helper reason");

result = classifyAlumdoorItemSourceCode("NVL-INOX, NVL-NHUA, NVL-MOC", { source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT });
expect(result.status, "excluded", "composite CÂY KÉO code exclusion");
expect(result.reason, "composite_component_list_not_item_code", "composite CÂY KÉO reason");

result = classifyAlumdoorItemSourceCode("NVL-TON-ST-1LYx175-_MSK", { source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT, source_index: 351 });
expect(result.status, "blocked", "duplicate Super source code must block on numbered product rows");
expect(result.reason, "duplicate_source_code_for_distinct_products", "duplicate Super product block reason");

result = classifyAlumdoorItemSourceCode("NVL-TON-ST-1LYx175-_MSK", { source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE });
expect(result.status, "blocked", "contextual BOM collision must block without source row context");
expect(result.reason, "context_required_for_collision", "contextual BOM collision block reason");

result = classifyAlumdoorItemSourceCode("NVL-TON-ST-1LYx175-_MSK", { source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE, source_index: 351 });
expect(result.status, "alias", "Super 1.2LY BOM reference resolution status");
expect(result.canonical_item_code, "NVL-TON-DL1.2LYx175-STD", "Super 1.2LY stock reference target");

result = classifyAlumdoorItemSourceCode("NVL-TON-ST-1LYx175-_MSK", { source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE, source_index: 352 });
expect(result.status, "alias", "Super 1.3LY BOM reference resolution status");
expect(result.canonical_item_code, "NVL-TON-DL1.3LYx175-STD", "Super 1.3LY stock reference target");

result = classifyAlumdoorItemSourceCode("NVL-V5_KEM_STD", { source_role: ITEM_SOURCE_ROLES.STOCK_ITEM });
expect(result.status, "source", "V5 shared identity remains one Item");
expect(result.canonical_item_code, "NVL-V5_KEM_STD", "V5 shared identity code must not split");
expect(result.reason, "shared_identity_with_dimensions", "V5 finish belongs to dimensions");

for (const [source, target] of Object.entries(ITEM_SOURCE_ALIASES)) {
  if (source.includes(",")) throw new Error(`Alias source không được là composite code: ${source}`);
  if (target.includes(",")) throw new Error(`Alias target không được là composite code: ${target}`);
}
for (const [source, rules] of Object.entries(ITEM_SOURCE_CONTEXTUAL_COLLISIONS)) {
  if (!rules.every((rule) => rule.source_indexes.length > 0)) throw new Error(`Collision thiếu source index: ${source}`);
}

console.log(`ALUMDOOR_ITEM_SOURCE_CONTRACT_PASS aliases=${Object.keys(ITEM_SOURCE_ALIASES).length} contextual=${Object.keys(ITEM_SOURCE_CONTEXTUAL_COLLISIONS).length}`);
