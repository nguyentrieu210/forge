import { expect, test, type Locator, type Page } from "@playwright/test";
import { annotate, browserRequest, chooseLink, login, openModule, OperatorAudit, readiness, requireLocalMutation, unwrap } from "./harness.js";

async function listPurchaseOrders(page: Page): Promise<string[]> {
  const params = new URLSearchParams({ fields: JSON.stringify(["name"]), order_by: "creation desc", limit_page_length: "100" });
  const response = await browserRequest(page, `/api/resource/${encodeURIComponent("Purchase Order")}?${params}`);
  if (response.status !== 200) return [];
  return (unwrap(response.body) as Array<{ name?: string }>).map((row) => row.name ?? "").filter(Boolean);
}

async function chooseCellLink(page: Page, cell: Locator, value: string) {
  const trigger = cell.getByRole("button").first();
  await expect(trigger).toBeVisible();
  await trigger.click();
  const input = page.locator('[cmdk-input=""]').last();
  await input.fill(value);
  const option = page.locator('[cmdk-item=""]').filter({ hasText: value }).filter({ hasNotText: "Tạo mới" }).first();
  await expect(option).toBeVisible();
  await option.click();
}

async function cellFor(page: Page, gridName: string, row: number, field: string) {
  const grid = page.locator(`[data-action-child-grid="${gridName}"]`);
  await expect(grid).toBeVisible();
  const fields = (await grid.getAttribute("data-primary-columns") ?? "").split(",");
  const index = fields.indexOf(field);
  if (index < 0) throw new Error(`CONFIG grid ${gridName} does not expose field ${field}; columns=${fields.join(",")}`);
  return grid.locator(`[data-cell="${row}:${index}"]`);
}

async function confirmIfDialog(page: Page, preferred: string) {
  const dialog = page.getByRole("dialog");
  if (!(await dialog.count())) return;
  for (const label of [preferred, "Xác nhận", "Tiếp tục"]) {
    const button = dialog.getByRole("button", { name: label, exact: true });
    if (await button.count()) { await button.click(); return; }
  }
}

test("E2E-02 buyer creates Purchase Order from the declared Mua hàng screen @core", async ({ page }, testInfo) => {
  annotate(testInfo, "E2E-02", "Mua hàng");
  requireLocalMutation();
  const audit = new OperatorAudit(page);
  await login(page, audit);
  const ready = await readiness(page, [["Supplier", "QA-SUPPLIER"], ["Item", "QA-PURCHASE-ITEM"], ["Warehouse", "K36"]]);
  test.skip(!ready.ready, `BLOCKED_DATA missing ${ready.missing.join(", ")}`);
  const before = new Set(await listPurchaseOrders(page));

  await openModule(page, "Mua hàng");
  const tabs = page.getByRole("navigation", { name: "Nghiệp vụ Mua hàng" });
  await expect(tabs).toBeVisible();
  await tabs.getByRole("button", { name: "Mua hàng", exact: true }).click();
  await expect(page.locator("body")).toContainText("Lập đơn mua");

  await chooseLink(page, "NCC", "QA-SUPPLIER");
  const schedule = page.getByLabel("Ngày giao", { exact: true });
  if (await schedule.count()) {
    const d = new Date(); d.setDate(d.getDate() + 2); await schedule.fill(d.toISOString().slice(0, 10));
  }

  await chooseCellLink(page, await cellFor(page, "items", 0, "item_code"), "QA-PURCHASE-ITEM");
  await (await cellFor(page, "items", 0, "qty")).locator("input").fill("2");
  await (await cellFor(page, "items", 0, "rate")).locator("input").fill("100000");
  await audit.checkpoint("Purchase order input ready");

  const save = page.getByRole("button", { name: "Lưu", exact: true }).last();
  await expect(save).toBeEnabled();
  await save.click();
  await confirmIfDialog(page, "Lưu");
  await expect(page.locator("[data-action-result]")).toBeVisible({ timeout: 20_000 });

  const after = await listPurchaseOrders(page);
  const po = after.find((name) => !before.has(name));
  expect(po, "Mua hàng UI commit must create exactly one discoverable canonical Purchase Order").toBeTruthy();
  const readback = await browserRequest(page, `/api/resource/${encodeURIComponent("Purchase Order")}/${encodeURIComponent(po!)}`);
  expect(readback.status, readback.text).toBe(200);
  expect(String((unwrap(readback.body) as Record<string, unknown>).supplier)).toBe("QA-SUPPLIER");

  const history = tabs.getByRole("button", { name: "Lịch sử mua hàng", exact: true });
  if (await history.count()) {
    await history.click();
    await expect(page.locator("body")).toContainText(po!);
  }
  await audit.checkpoint("Procurement readback/history");
  await audit.finish(testInfo);
});
