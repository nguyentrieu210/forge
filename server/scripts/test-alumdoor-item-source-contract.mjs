#!/usr/bin/env node
import {
  ITEM_SOURCE_ALIASES,
  ITEM_SOURCE_CONTEXTUAL_COLLISIONS,
  ITEM_SOURCE_ROLES,
  ITEM_SOURCE_SHARED_IDENTITIES,
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

result = classifyAlumdoorItemSourceCode("PHUTHUCHUYENDOICUAKT", { source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE });
expect(result.status, "excluded", "PHUTHU without hyphen exclusion");
expect(result.canonical_item_code, "", "PHUTHU without hyphen must not become Item");

result = classifyAlumdoorItemSourceCode("CPSTD_LADL", { source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE });
expect(result.status, "excluded", "CPSTD cost exclusion");
expect(result.canonical_item_code, "", "CPSTD cost must not become Item");

result = classifyAlumdoorItemSourceCode("CPVC", { source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT });
expect(result.status, "excluded", "transport cost exclusion");
expect(result.reason, "service_or_cost_not_stock_item", "transport cost exclusion reason");

result = classifyAlumdoorItemSourceCode("TIỀN CÔNG LẮP ĐẶT", { source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT });
expect(result.status, "excluded", "installation service exclusion");

result = classifyAlumdoorItemSourceCode("NVL-LD-3LD", { source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE });
expect(result.status, "excluded", "aggregate BOM helper exclusion");
expect(result.reason, "aggregate_bom_helper", "aggregate BOM helper reason");

result = classifyAlumdoorItemSourceCode("NVL-INOX, NVL-NHUA, NVL-MOC", { source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT });
expect(result.status, "excluded", "composite CÂY KÉO code exclusion");
expect(result.reason, "composite_component_list_not_item_code", "composite CÂY KÉO reason");

result = classifyAlumdoorItemSourceCode("NVL-TRUC114_1.8LY", { source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE });
expect(result.status, "alias", "trục 114 BOM alias status");
expect(result.canonical_item_code, "NVL-TR114-1.8", "trục 114 BOM alias target");

result = classifyAlumdoorItemSourceCode("NVL-TOLE1.2x190-CORON", { source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE });
expect(result.status, "alias", "ray có ron BOM alias status");
expect(result.canonical_item_code, "NVL-TOLE1.2x190-RON", "ray có ron BOM alias target");

result = classifyAlumdoorItemSourceCode("NVL-BO2VIS-501-552", { source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE });
expect(result.status, "alias", "bọ 501/552 BOM alias status");
expect(result.canonical_item_code, "NVL-BO2VIS-501N-552", "bọ 501/552 BOM alias target");

result = classifyAlumdoorItemSourceCode("NVL-ALD-DL652VK", { source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE });
expect(result.status, "alias", "profile no-space alias status");
expect(result.canonical_item_code, "NVL-AL652-VK", "profile no-space alias target");

result = classifyAlumdoorItemSourceCode("NVL-TRUC114_1.8LY", { source_role: ITEM_SOURCE_ROLES.STOCK_ITEM });
expect(result.status, "source", "stock identity must not be rewritten by BOM alias");
expect(result.canonical_item_code, "NVL-TRUC114_1.8LY", "stock source code stays exact");

result = classifyAlumdoorItemSourceCode("NVL-TON-ST-1LYx175-_MSK", { source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT, source_index: 351 });
expect(result.status, "source", "Super shared sellable identity status");
expect(result.reason, "shared_identity_with_dimensions", "Super shared sellable identity reason");
expect(result.canonical_item_code, "NVL-TON-ST-1LYx175-_MSK", "Super shared sellable code must stay exact");
if (!ITEM_SOURCE_SHARED_IDENTITIES["NVL-TON-ST-1LYx175-_MSK"]?.dimensions.includes("material_specification")) {
  throw new Error("Super shared identity phải dùng material_specification dimension");
}

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
