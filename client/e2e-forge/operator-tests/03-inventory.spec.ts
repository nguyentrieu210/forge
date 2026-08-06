import { expect, test } from "@playwright/test";
import { annotate, browserRequest, chooseLink, login, openModule, OperatorAudit, requireLocalMutation, unwrap } from "./harness.js";

function uniqueRef(): string {
  return `OP-E2E-CUT-${Date.now()}`;
}

async function confirmIfVisible(page: import("@playwright/test").Page, preferred: string) {
  const dialog = page.getByRole("dialog");
  if (!(await dialog.count())) return;
  for (const label of [preferred, "Xác nhận", "Tiếp tục"]) {
    const button = dialog.getByRole("button", { name: label, exact: true });
    if (await button.count()) { await button.click(); return; }
  }
}

test("E2E-03 warehouse operator previews and applies a real aluminium cut through UI @core", async ({ page }, testInfo) => {
  annotate(testInfo, "E2E-03", "Thủ kho");
  requireLocalMutation();
  const audit = new OperatorAudit(page);
  await login(page, audit);

  await openModule(page, "Kho");
  const tabs = page.getByRole("navigation", { name: "Nghiệp vụ Kho" });
  await expect(tabs).toBeVisible();
  const cutTab = tabs.getByRole("button", { name: "Cắt nhôm", exact: true });
  await expect(cutTab).toBeVisible();
  await cutTab.click();
  await expect(page.locator("body")).toContainText("Cắt nhôm");

  await chooseLink(page, "Mã nhôm", "AL71-QA");
  await page.getByLabel(/Rộng cắt lá/).fill("3.5");
  await page.getByLabel(/Số lá cần/).fill("2");
  const reference = uniqueRef();
  await page.getByLabel(/Số chứng từ/).fill(reference);

  // Decimal entry is part of operator correctness: 3.5 must remain 3.5/3,5, never 35.
  const cutWidth = await page.getByLabel(/Rộng cắt lá/).inputValue();
  expect(cutWidth.replace(",", ".")).toBe("3.5");

  await page.getByRole("button", { name: "Xem đề xuất", exact: true }).click();
  await expect(page.locator("body")).toContainText(/chưa ghi gì/i, { timeout: 20_000 });
  const previewText = await page.locator("body").innerText();
  const lot = previewText.match(/\bLN-[A-Z0-9._/-]+\b/i)?.[0];
  test.skip(!lot, `BLOCKED_DATA no physical aluminium lot satisfies AL71-QA width 3.5m; preview=${previewText.slice(-500)}`);
  await audit.checkpoint("Inventory cut preview");

  const apply = page.getByRole("button", { name: "Cắt và trừ tồn", exact: true });
  await expect(apply).toBeEnabled();
  await apply.click();
  await confirmIfVisible(page, "Cắt và trừ tồn");
  await expect(page.locator("body")).toContainText(/đã cắt|Cut Order|phiếu cắt/i, { timeout: 20_000 });

  const params = new URLSearchParams({ fields: JSON.stringify(["name", "reference_no", "profile", "cut_state"]), limit_page_length: "20", order_by: "creation desc" });
  const readback = await browserRequest(page, `/api/resource/${encodeURIComponent("Cut Order")}?${params}`);
  test.skip(readback.status !== 200, `BLOCKED_CONFIG Cut Order readback contract ${readback.status}: ${readback.text.slice(0, 300)}`);
  const rows = unwrap(readback.body) as Array<Record<string, unknown>>;
  const created = rows.find((row) => String(row.reference_no ?? "") === reference);
  expect(created, `authoritative Cut Order must retain UI reference ${reference}`).toBeTruthy();
  await audit.checkpoint("Inventory cut authoritative readback");
  await audit.finish(testInfo);
});
