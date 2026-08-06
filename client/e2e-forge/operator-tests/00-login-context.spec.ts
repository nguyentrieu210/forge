import { expect, test } from "@playwright/test";
import { annotate, bodyTextContainsNoFatal, login, openModule, OperatorAudit } from "./harness.js";

test("E2E-00 operator login and context @core @mobile", async ({ page }, testInfo) => {
  annotate(testInfo, "E2E-00", "Operator");
  const audit = new OperatorAudit(page);
  const { roles } = await login(page, audit);
  expect(roles.length).toBeGreaterThan(0);
  await expect(page.getByText("Cần chọn phạm vi dữ liệu", { exact: true })).toHaveCount(0);
  await bodyTextContainsNoFatal(page);
  for (const module of ["Bán hàng", "Mua hàng", "Kho", "Sản xuất", "Công nợ", "Bảo hành", "Nhân sự & Tiền lương"]) {
    await openModule(page, module);
    await bodyTextContainsNoFatal(page);
  }
  await audit.checkpoint("E2E-00 final navigation");
  await audit.finish(testInfo);
});
