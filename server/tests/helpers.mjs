import { makeCommand } from "../dist/packages/test-harness/src/index.js";

export function seedStandardMasters(store) {
  store.seedO2CMasters({
    company: "Demo",
    customer: "CUST-0001",
    currency: "USD",
    items: ["ITEM-001", "ITEM-002"],
    warehouses: ["Stores"],
    accounts: ["Debtors", "Sales", "Output Tax", "Bank"],
  });
  store.seedStock({ itemCode: "ITEM-001", warehouse: "Stores", qty: "100.000000", valuationRate: "15.00" });
  store.seedStock({ itemCode: "ITEM-002", warehouse: "Stores", qty: "100.000000", valuationRate: "5.00" });
}

export async function mutate(kernel, input) {
  return kernel.execute(await makeCommand(input));
}

export async function createAndSubmit(kernel, input) {
  await mutate(kernel, { ...input, commandId: `${input.name}-create`, action: "create", expectedVersion: null });
  return mutate(kernel, { ...input, commandId: `${input.name}-submit`, action: "submit", expectedVersion: 1 });
}

export function orderDocument(qty = "10", rate = "25") {
  return {
    customer: "CUST-0001", company: "Demo", currency: "USD", currency_scale: 2, transaction_date: "2026-07-23",
    items: [{ row_id: "SOI-1", item_code: "ITEM-001", qty, rate }],
    taxes: [{ row_id: "TAX-1", account: "Output Tax", rate: "10" }],
  };
}
