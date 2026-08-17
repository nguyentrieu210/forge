import { ITEM_SOURCE_ROLES } from "./alumdoor-item-source-contract.mjs";

export function partitionAlumdoorItemSourceBlockers(blockers) {
  if (!Array.isArray(blockers)) throw new Error("Item blockers phải là array");

  const item_master_blockers = [];
  const bom_blockers = [];
  const other_blockers = [];

  for (const blocker of blockers) {
    if (
      blocker.source_role === ITEM_SOURCE_ROLES.SELLABLE_PRODUCT
      || blocker.source_role === ITEM_SOURCE_ROLES.STOCK_ITEM
    ) {
      item_master_blockers.push(blocker);
    } else if (blocker.source_role === ITEM_SOURCE_ROLES.BOM_REFERENCE) {
      bom_blockers.push(blocker);
    } else {
      other_blockers.push(blocker);
    }
  }

  return {
    item_master_blocker_count: item_master_blockers.length,
    bom_blocker_count: bom_blockers.length,
    other_blocker_count: other_blockers.length,
    item_master_blockers,
    bom_blockers,
    other_blockers,
  };
}
