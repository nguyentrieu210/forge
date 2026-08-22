import { readFileSync } from "node:fs";

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

/**
 * Phiên bản brief Alumdoor, đọc từ chính brief.
 *
 * Trước đây 7 test ghim thẳng chuỗi "2.11.1". Brief đi tới 2.25.0 thì cả 7 đỏ cùng lúc, mà
 * không có test nào nói lên điều gì sai — chỉ là con số viết ở hai nơi rồi trôi dạt. Đọc thẳng
 * từ nguồn thì hết trôi. Cái CẦN khoá không phải con số, mà là ba file brief phải cùng một
 * phiên bản: `.integrations` gộp SAU CÙNG nên phiên bản của nó ĐÈ lên brief chính, quên bump
 * là cài nhầm phiên bản trong im lặng.
 */
export function alumdoorBriefVersion() {
  const doc = (ten) => JSON.parse(readFileSync(new URL(`../briefs/${ten}`, import.meta.url), "utf8"));
  const chinh = doc("alumdoor-v2.json").version;
  const tichHop = doc("alumdoor-v2.integrations.json").version;
  if (chinh !== tichHop) {
    throw new Error(`brief chính ${chinh} khác .integrations ${tichHop} — .integrations gộp sau cùng nên nó đè, phải bump cả hai.`);
  }
  return chinh;
}
