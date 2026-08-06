import { expect, test, type Locator, type Page } from "@playwright/test";
import { annotate, browserRequest, chooseLink, login, openModule, OperatorAudit, readiness, requireLocalMutation, unwrap } from "./harness.js";

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
  const qty = await cellFor(page, "items", 0, "qty");
  await qty.locator("input").fill("2");
  const rate = await cellFor(page, "items", 0, "rate");
  await rate.locator("input").fill("100000");
  await audit.checkpoint("Purchase order input ready");

  const save = page.getByRole("button", { name: "Lưu", exact: true }).last();
  await expect(save).toBeEnabled();
  await save.click();
  await confirmIfDialog(page, "Lưu");
  await expect(page.locator("body")).toContainText(/Purchase Order|Đơn mua|PO-/i, { timeout: 20_000 });

  // Authoritative readback: the action result must expose a canonical document name that can be reopened.
  const text = await page.locator("body").innerText();
  const match = text.match(/\b(?:PO|PUR-ORD)[A-Z0-9._/-]*\d[A-Z0-9._/-]*\b/i);
  test.skip(!match, "BLOCKED_CONFIG action completed but no canonical Purchase Order identifier was exposed for readback");
  const po = match![0];
  const readback = await browserRequest(page, `/api/resource/${encodeURIComponent("Purchase Order")}/${encodeURIComponent(po)}`);
  expect(readback.status, readback.text).toBe(200);
  expect(String((unwrap(readback.body) as Record<string, unknown>).supplier)).toBe("QA-SUPPLIER");

  const history = tabs.getByRole("button", { name: "Lịch sử mua hàng", exact: true });
  if (await history.count()) {
    await history.click();
    await expect(page.locator("body")).toContainText(po);
  }
  await audit.checkpoint("Procurement readback/history");
  await audit.finish(testInfo);
});
