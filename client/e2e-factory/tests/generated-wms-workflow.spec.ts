import { test, expect } from "@playwright/test";

/**
 * P1-WF-01 (LIVE) — app sinh ra gọi ĐÚNG endpoint mới (metaforge.api.get_workflow_transitions, KHÔNG
 * còn native frappe.model.workflow.get_transitions) và nhận has_workflow SERVER-AUTHORITATIVE.
 *
 * PHẠM VI: ToDo (doctype duy nhất có workflow trên site test) là is_submittable=0 → nhánh
 * "hasWorkflow ẩn Submit/Cancel thủ công" (resolveFormActions) KHÔNG BAO GIỜ quan sát được qua UI
 * của riêng ToDo dù có bug hay không (điều kiện docstatus===1 không bao giờ đạt). Nhánh logic đó đã
 * PURE-TESTED sẵn từ trước (selfcheck "Form actions: metadata-driven", KHÔNG đổi trong Phase 4) và
 * has_workflow backend đã LIVE-verify riêng qua curl (User→false · ToDo Pending→true+1 transition ·
 * ToDo Approved thật, apply_workflow thật→true+[]  — xem commit). Bài test NÀY chỉ còn phần chưa
 * chứng minh: FRONTEND THẬT (trình duyệt, không phải curl) có gọi đúng endpoint mới và nhận đúng giá
 * trị hay không — tức xác nhận DÂY NỐI (FormContainer→adapter→backend mới) hoạt động, không phải
 * suy từ đọc code.
 */

test("mở ToDo có workflow (Pending, còn transition) → FE gọi metaforge.api.get_workflow_transitions, has_workflow=true", async ({ page }) => {
  const responses: Array<{ url: string; body: unknown }> = [];
  page.on("response", async (r) => {
    if (r.url().includes("get_workflow_transitions")) {
      try { responses.push({ url: r.url(), body: await r.json() }); } catch { /* ignore non-JSON */ }
    }
  });

  await page.goto("/app/ToDo");
  const row = page.locator("tr[data-index]").first();
  await row.waitFor({ state: "visible", timeout: 20_000 });
  await row.click();
  await expect(page).toHaveURL(/\/app\/ToDo\/.+/, { timeout: 15_000 });
  await page.waitForTimeout(2000); // để request get_workflow_transitions kịp chạy

  // KHÔNG còn gọi native frappe.model.workflow.get_transitions nữa (đã thay bằng wrapper mới).
  const calledOld = responses.some((r) => r.url.includes("frappe.model.workflow.get_transitions"));
  expect(calledOld, "không được gọi native get_transitions nữa").toBeFalsy();

  const calledNew = responses.find((r) => r.url.includes("metaforge.api.get_workflow_transitions"));
  expect(calledNew, "phải gọi metaforge.api.get_workflow_transitions").toBeTruthy();
  const body = calledNew!.body as { message?: { has_workflow?: boolean; transitions?: unknown[] } };
  expect(body.message?.has_workflow, JSON.stringify(body)).toBe(true);
});
