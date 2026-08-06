import { expect, test, type Page } from "@playwright/test";
import { annotate, browserRequest, chooseLink, login, openModule, OperatorAudit, requireLocalMutation, unwrap } from "./harness.js";

async function listNames(page: Page, doctype: string): Promise<string[]> {
  const params = new URLSearchParams({ fields: JSON.stringify(["name"]), order_by: "creation desc", limit_page_length: "50" });
  const response = await browserRequest(page, `/api/resource/${encodeURIComponent(doctype)}?${params}`);
  if (response.status !== 200) return [];
  return (unwrap(response.body) as Array<{ name?: string }>).map((row) => row.name ?? "").filter(Boolean);
}

async function confirmIfVisible(page: Page, preferred: string) {
  const dialog = page.getByRole("dialog");
  if (!(await dialog.count())) return;
  for (const label of [preferred, "Xác nhận", "Tiếp tục"]) {
    const button = dialog.getByRole("button", { name: label, exact: true });
    if (await button.count()) { await button.click(); return; }
  }
}

test("E2E-03 warehouse operator proposes a lot, drafts Cut Order and posts the cut through UI @core", async ({ page }, testInfo) => {
  annotate(testInfo, "E2E-03", "Thủ kho");
  requireLocalMutation();
  const audit = new OperatorAudit(page);
  await login(page, audit);
  const beforeCuts = new Set(await listNames(page, "Cut Order"));

  await openModule(page, "Kho");
  const tabs = page.getByRole("navigation", { name: "Nghiệp vụ Kho" });
  await expect(tabs).toBeVisible();

  // Current 2.3.x authority is two-step: proposal -> draft Cut Order -> post cut.
  const proposeTab = tabs.getByRole("button", { name: "Chọn lô cắt", exact: true });
  await expect(proposeTab).toBeVisible();
  await proposeTab.click();
  await expect(page.locator("body")).toContainText(/Đề xuất lô cắt|Chọn lô cắt/i);

  await chooseLink(page, "Mã nhôm", "AL71-QA");
  const color = page.getByRole("button", { name: "Màu (bỏ trống = mọi màu)", exact: true });
  if (await color.count()) await chooseLink(page, "Màu (bỏ trống = mọi màu)", "THÔ");
  await chooseLink(page, "Kho", "K36");
  await chooseLink(page, "Công thức cửa", "Cửa Đức — công thức chuẩn");
  await page.getByLabel(/Rộng cắt lá/).fill("3.5");
  await page.getByLabel(/Số lá cần/).fill("2");

  const cutWidth = await page.getByLabel(/Rộng cắt lá/).inputValue();
  expect(cutWidth.replace(",", ".")).toBe("3.5");

  await page.getByRole("button", { name: "Xem đề xuất", exact: true }).click();
  await expect(page.locator("[data-action-result]")).toBeVisible({ timeout: 20_000 });
  const previewText = await page.locator("body").innerText();
  const lot = previewText.match(/\bLN-[A-Z0-9._/-]+\b/i)?.[0];
  test.skip(!lot, `BLOCKED_DATA no physical aluminium lot satisfies AL71-QA width 3.5m; preview=${previewText.slice(-700)}`);
  await audit.checkpoint("Inventory proposal preview");

  const draft = page.getByRole("button", { name: "Tạo phiếu cắt nháp", exact: true });
  await expect(draft).toBeEnabled();
  await draft.click();
  await expect(page.locator("body")).toContainText(/phiếu cắt|Cut Order/i, { timeout: 20_000 });

  const afterDraft = await listNames(page, "Cut Order");
  const cutOrder = afterDraft.find((name) => !beforeCuts.has(name));
  expect(cutOrder, "proposal commit must create one canonical Cut Order draft").toBeTruthy();
  const draftDoc = await browserRequest(page, `/api/resource/${encodeURIComponent("Cut Order")}/${encodeURIComponent(cutOrder!)}`);
  expect(draftDoc.status, draftDoc.text).toBe(200);
  expect(Number((unwrap(draftDoc.body) as Record<string, unknown>).docstatus)).toBe(0);

  const cutTab = tabs.getByRole("button", { name: "Cắt nhôm", exact: true });
  await expect(cutTab).toBeVisible();
  await cutTab.click();
  await chooseLink(page, "Phiếu cắt (nháp)", cutOrder!);
  const apply = page.getByRole("button", { name: "Cắt và trừ tồn", exact: true });
  await expect(apply).toBeEnabled();
  await apply.click();
  await confirmIfVisible(page, "Cắt và trừ tồn");
  await expect(page.locator("body")).toContainText(/đã cắt|ghi sổ|Cut Order|phiếu cắt/i, { timeout: 20_000 });

  const submitted = await browserRequest(page, `/api/resource/${encodeURIComponent("Cut Order")}/${encodeURIComponent(cutOrder!)}`);
  expect(submitted.status, submitted.text).toBe(200);
  expect(Number((unwrap(submitted.body) as Record<string, unknown>).docstatus)).toBe(1);
  await audit.checkpoint("Inventory cut authoritative readback");
  await audit.finish(testInfo);
});
