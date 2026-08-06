import { expect, test } from "@playwright/test";
import { annotate, browserRequest, login, openModule, OperatorAudit, unwrap } from "./harness.js";

async function countDocs(page: import("@playwright/test").Page, doctype: string, filters: unknown[] = []): Promise<number | null> {
  const params = new URLSearchParams({ fields: JSON.stringify(["name"]), filters: JSON.stringify(filters), limit_page_length: "5" });
  const response = await browserRequest(page, `/api/resource/${encodeURIComponent(doctype)}?${params}`);
  if (response.status !== 200) return null;
  return (unwrap(response.body) as unknown[]).length;
}

test("E2E-07 HR operator reaches the curated employee-to-payroll chain @support @mobile", async ({ page }, testInfo) => {
  annotate(testInfo, "E2E-07", "Nhân sự/Tiền lương");
  const audit = new OperatorAudit(page);
  await login(page, audit);

  await openModule(page, "Nhân sự & Tiền lương");
  const nav = page.getByRole("navigation", { name: "Nghiệp vụ Nhân sự & Tiền lương" });
  await expect(nav).toBeVisible();
  const text = await nav.innerText();
  for (const required of ["Employee", "Employment Contract", "Attendance", "Payroll Entry", "Salary Slip"]) {
    expect(text, `HR daily workspace must expose ${required}`).toContain(required);
  }
  await audit.checkpoint("HR curated workspace");

  const employees = await countDocs(page, "Employee", [["status", "!=", "Left"]]);
  test.skip(employees == null, "BLOCKED_CONFIG canonical Employee route is unavailable to the current HR workspace/persona");
  test.skip(employees === 0, "BLOCKED_DATA no active Employee exists; payroll chain cannot be audited with an empty workforce");

  const contracts = await countDocs(page, "Employment Contract");
  const attendance = await countDocs(page, "Attendance");
  const payroll = await countDocs(page, "Payroll Entry");
  test.skip(contracts == null || attendance == null || payroll == null, "BLOCKED_CONFIG one or more canonical HR/payroll DocTypes are not readable through the dependency-owned routes");
  test.skip(contracts === 0 || attendance === 0, `BLOCKED_DATA HR starting data incomplete: contracts=${contracts} attendance=${attendance}`);

  // Do not synthesize payroll business inputs merely to make the browser lane green. The next
  // mutation must be a real Payroll Entry from the UI once employee/contract/time fixtures exist.
  test.skip(true, `BLOCKED_DATA payroll prerequisites exist only partially (payroll entries=${payroll}); deterministic salary structure/pay-period fixture is not declared yet`);
});
