import { expect, test } from "@playwright/test";
import { annotate, browserRequest, chooseLink, login, openModule, OperatorAudit, readiness, requireLocalMutation, unwrap } from "./harness.js";

const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
const inputUnder = (page: Parameters<typeof test>[0] extends never ? never : any, label: string) => page.locator("label").filter({ hasText: label }).first().locator("..").locator("input").first();
const selectUnder = (page: any, label: string) => page.locator("label").filter({ hasText: label }).first().locator("..").locator("select").first();

test("E2E-01 Sales creates and confirms one real door order through UI @core", async ({ page }, testInfo) => {
  annotate(testInfo, "E2E-01", "Kinh doanh");
  requireLocalMutation();
  const audit = new OperatorAudit(page);
  await login(page, audit);

  const basic = await readiness(page, [
    ["Customer", "QA-CUSTOMER"], ["Price List", "QA-SELLING"], ["Item", "CUA-DUC"],
    ["Warehouse", "K36"], ["Item Color", "TRANG"], ["Cutting Policy", "POL-DUC-U75"],
  ]);
  test.skip(!basic.ready, `BLOCKED_DATA missing ${basic.missing.join(", ")}`);

  const formulaResponse = await browserRequest(page, "/api/method/alumdoor.sales.production_line_context", {
    method: "POST",
    body: {
      item_code: "CUA-DUC", customer_group: "Lẻ", sales_mode: "Trọn bộ", ray_type: "U75",
      width_input_basis: "Rộng lọt lòng", height_input_basis: "Cao lọt lòng", width_m: 4, height_m: 2.3,
      set_count: 1, color: "TRANG", delivery_date: tomorrow(),
    },
  });
  test.skip(formulaResponse.status !== 200, `BLOCKED_CONFIG sales formula preflight ${formulaResponse.status}: ${formulaResponse.text.slice(0, 300)}`);
  const formula = unwrap(formulaResponse.body) as Record<string, unknown>;
  const profile = String(formula.stock_profile_item ?? "");
  test.skip(!profile, `BLOCKED_CONFIG BOM did not resolve stock profile: ${String(formula.stock_profile_error ?? "unknown")}`);

  const priceResponse = await browserRequest(page, "/api/method/alumdoor.sales.item_context", {
    method: "POST",
    body: { item_code: "CUA-DUC", price_list: "QA-SELLING", currency: "VND", warehouse: "K36" },
  });
  test.skip(priceResponse.status !== 200, `BLOCKED_CONFIG sales price preflight ${priceResponse.status}: ${priceResponse.text.slice(0, 300)}`);

  const stockResponse = await browserRequest(page, "/api/method/alumdoor.cut.propose", {
    method: "POST",
    body: { item_code: profile, warehouse: "K36", color: "TRANG", cut_width_m: Number(formula.cut_width_m), sheets: Number(formula.total_leaf_count) },
  });
  test.skip(stockResponse.status !== 200, `BLOCKED_DATA ATP preflight ${stockResponse.status}: ${stockResponse.text.slice(0, 300)}`);
  const stock = unwrap(stockResponse.body) as { short?: number };
  test.skip(Number(stock.short ?? 0) > 0, `BLOCKED_DATA ATP shortage ${stock.short}`);

  await openModule(page, "Bán hàng");
  const tabs = page.getByRole("navigation", { name: "Nghiệp vụ Bán hàng" });
  await expect(tabs).toBeVisible();
  await tabs.getByRole("button", { name: "Bán hàng", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bán hàng", exact: true })).toBeVisible();

  await chooseLink(page, "Khách hàng", "QA-CUSTOMER");
  await selectUnder(page, "Nhóm giá").selectOption({ label: "Lẻ" });
  await chooseLink(page, "Bảng giá", "QA-SELLING");
  const warehouseButton = page.getByRole("button", { name: "Kho ATP", exact: true });
  if (await warehouseButton.count()) await chooseLink(page, "Kho ATP", "K36");
  await inputUnder(page, "Ngày giao").fill(tomorrow());

  await chooseLink(page, "Mặt hàng cửa", "CUA-DUC");
  await chooseLink(page, "Màu", "TRANG");
  await inputUnder(page, "Rộng khách báo").fill("4");
  await inputUnder(page, "Cao khách báo").fill("2.3");
  await inputUnder(page, "Số bộ").fill("1");

  await expect(page.getByText("đã cập nhật", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Đủ lô nhôm để đáp ứng", { exact: true })).toBeVisible();
  await audit.checkpoint("Sales preview ready");

  await page.getByRole("button", { name: "Lưu nháp", exact: true }).click();
  await expect(page.getByText(/Nháp đang làm việc/)).toBeVisible();
  const draftText = await page.getByText(/Nháp đang làm việc/).innerText();
  const draftName = draftText.split("·", 1)[0]?.trim() ?? "";
  expect(draftName).toBeTruthy();

  await page.getByRole("button", { name: "Xác nhận & giữ chỗ", exact: true }).click();
  await expect(page.getByText(/Đã xác nhận/).last()).toBeVisible({ timeout: 20_000 });
  const doc = await browserRequest(page, `/api/resource/${encodeURIComponent("Sales Order")}/${encodeURIComponent(draftName)}`);
  expect(doc.status, doc.text).toBe(200);
  expect(Number((unwrap(doc.body) as Record<string, unknown>).docstatus)).toBe(1);

  const historyTab = tabs.getByRole("button", { name: "Lịch sử bán hàng", exact: true });
  if (await historyTab.count()) {
    await historyTab.click();
    await expect(page.locator("body")).toContainText(draftName);
  }
  await audit.checkpoint("Sales submitted readback");
  await audit.finish(testInfo);
});
