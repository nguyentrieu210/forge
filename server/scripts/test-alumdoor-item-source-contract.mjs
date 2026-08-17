#!/usr/bin/env node
import {
  ITEM_SOURCE_ALIASES,
  ITEM_SOURCE_CONTEXTUAL_COLLISIONS,
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
expect(result.status, "alias", "audited alias status");
expect(result.canonical_item_code, "NVL-AL501-VK", "audited alias target");
expect(result.source_code_original, "NVL-TD-AL501N VK", "audited alias trace");

result = classifyAlumdoorItemSourceCode("TRU-TP_KHONGBDK_TANKER-ALUMAX");
expect(result.status, "excluded", "TRU adjustment exclusion");
expect(result.canonical_item_code, "", "TRU adjustment must not become Item");

result = classifyAlumdoorItemSourceCode("PHUTHU-UC<7m²");
expect(result.status, "excluded", "PHUTHU exclusion");
expect(result.canonical_item_code, "", "PHUTHU must not become Item");

result = classifyAlumdoorItemSourceCode("NVL-LD-3LD");
expect(result.status, "excluded", "aggregate BOM helper exclusion");
expect(result.reason, "aggregate_bom_helper", "aggregate BOM helper reason");

result = classifyAlumdoorItemSourceCode("NVL-INOX, NVL-NHUA, NVL-MOC");
expect(result.status, "excluded", "composite CÂY KÉO code exclusion");
expect(result.reason, "composite_component_list_not_item_code", "composite CÂY KÉO reason");

result = classifyAlumdoorItemSourceCode("NVL-TON-ST-1LYx175-_MSK");
expect(result.status, "blocked", "contextual collision must block without source row context");
expect(result.reason, "context_required_for_collision", "contextual collision block reason");

result = classifyAlumdoorItemSourceCode("NVL-TON-ST-1LYx175-_MSK", { source_index: 351 });
expect(result.status, "alias", "Super 1.2LY contextual resolution status");
expect(result.canonical_item_code, "NVL-TON-DL1.2LYx175-STD", "Super 1.2LY contextual target");

result = classifyAlumdoorItemSourceCode("NVL-TON-ST-1LYx175-_MSK", { source_index: 352 });
expect(result.status, "alias", "Super 1.3LY contextual resolution status");
expect(result.canonical_item_code, "NVL-TON-DL1.3LYx175-STD", "Super 1.3LY contextual target");

result = classifyAlumdoorItemSourceCode("NVL-V5_KEM_STD");
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
