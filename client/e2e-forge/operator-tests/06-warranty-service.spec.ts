import { expect, test, type Page } from "@playwright/test";
import { annotate, browserRequest, chooseLink, login, openModule, OperatorAudit, requireLocalMutation, unwrap } from "./harness.js";

async function listNames(page: Page, doctype: string, filters: unknown[] = []): Promise<string[]> {
  const params = new URLSearchParams({ fields: JSON.stringify(["name"]), filters: JSON.stringify(filters), order_by: "creation desc", limit_page_length: "20" });
  const response = await browserRequest(page, `/api/resource/${encodeURIComponent(doctype)}?${params}`);
  if (response.status !== 200) return [];
  return (unwrap(response.body) as Array<{ name?: string }>).map((row) => row.name ?? "").filter(Boolean);
}

async function fullDoc(page: Page, doctype: string, name: string): Promise<Record<string, unknown> | null> {
  const response = await browserRequest(page, `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  return response.status === 200 ? unwrap(response.body) as Record<string, unknown> : null;
}

test("E2E-06 service operator opens a warranty case from an actually delivered document @support", async ({ page }, testInfo) => {
  annotate(testInfo, "E2E-06", "Bảo hành");
  requireLocalMutation();
  const audit = new OperatorAudit(page);
  await login(page, audit);

  const deliveries = await listNames(page, "Delivery Note", [["docstatus", "=", 1]]);
  test.skip(!deliveries.length, "BLOCKED_DATA no submitted Delivery Note exists; warranty lineage cannot be proven without a real delivered source document");
  const deliveryName = deliveries[0]!;
  const delivery = await fullDoc(page, "Delivery Note", deliveryName);
  test.skip(!delivery, `BLOCKED_DATA Delivery Note ${deliveryName} cannot be read back`);
  const firstItem = Array.isArray(delivery!.items) ? delivery!.items[0] as Record<string, unknown> | undefined : undefined;
  const salesOrder = String(firstItem?.sales_order ?? firstItem?.against_sales_order ?? delivery!.sales_order ?? "");
  const itemCode = String(firstItem?.item_code ?? "");
  test.skip(!salesOrder || !itemCode, `BLOCKED_CONFIG Delivery Note ${deliveryName} lacks Sales Order/item lineage required by warranty`);
  const before = new Set(await listNames(page, "Warranty Claim"));

  await openModule(page, "Bảo hành");
  const tabs = page.getByRole("navigation", { name: "Nghiệp vụ Bảo hành" });
  await expect(tabs).toBeVisible();
  const intake = tabs.getByRole("button", { name: "Tiếp nhận bảo hành", exact: true });
  await expect(intake).toBeVisible();
  await intake.click();

  await chooseLink(page, "Đơn bán", salesOrder);
  await chooseLink(page, "Phiếu giao đã ghi sổ", deliveryName);
  await chooseLink(page, "Mặt hàng lỗi", itemCode);
  await page.getByLabel("Ngày nhận lỗi", { exact: true }).fill(new Date().toISOString().slice(0, 10));
  await page.getByLabel("Nguyên nhân", { exact: true }).selectOption({ label: "Sản xuất" });
  const description = page.getByLabel("Nội dung lỗi", { exact: true });
  if (await description.count()) await description.fill("Operator E2E warranty acceptance");
  await audit.checkpoint("Warranty intake ready");

  const commit = page.getByRole("button", { name: "Mở hồ sơ", exact: true });
  await expect(commit).toBeEnabled();
  await commit.click();
  await expect(page.locator("body")).toContainText(/bảo hành|Warranty Claim|hồ sơ/i, { timeout: 20_000 });

  const after = await listNames(page, "Warranty Claim");
  const claim = after.find((name) => !before.has(name));
  expect(claim, "warranty UI commit must create one canonical Warranty Claim").toBeTruthy();
  const readback = await fullDoc(page, "Warranty Claim", claim!);
  expect(String(readback?.sales_order ?? "")).toBe(salesOrder);
  expect(String(readback?.delivery_note ?? "")).toBe(deliveryName);
  await audit.checkpoint("Warranty authoritative readback");
  await audit.finish(testInfo);
});
