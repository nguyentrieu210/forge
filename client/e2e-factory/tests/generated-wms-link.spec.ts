import { test, expect } from "@playwright/test";

/**
 * P1-LINK-01 (LIVE) — Dynamic Link CHƯA chọn doctype nguồn phải khoá + hướng dẫn (KHÔNG phải input
 * tự do). ToDo.reference_name (Dynamic Link, options="reference_type") + reference_type (Link,
 * options="DocType") — field ĐÚNG dạng cần test, có sẵn trên site thật, không cần dựng DocType riêng.
 * Phần còn lại (static Link thiếu options / thiếu services.searchLink / cờ dev free-text) đã pure-test
 * đầy đủ ở selfcheck (logic React thuần, không phụ thuộc site thật) — không lặp lại ở đây.
 */

const ADMIN_BACKEND = process.env.MF_BACKEND || "http://127.0.0.1:8000";
const ADMIN_TOKEN = process.env.MF_TOKEN;
const SITE = process.env.MF_SITE || "metaforge.localhost";
if (!ADMIN_TOKEN) throw new Error("MF_TOKEN required (Administrator) để tạo/xoá fixture ToDo.");

async function adminCall(method: string, body?: Record<string, unknown>) {
  const res = await fetch(`${ADMIN_BACKEND}/api/method/${method}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `token ${ADMIN_TOKEN}`, "X-Frappe-Site-Name": SITE, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, json };
}

let targetName: string | undefined;

test.beforeAll(async () => {
  // reference_type KHÔNG set → reference_name (Dynamic Link) phải ở trạng thái "chờ chọn nguồn".
  const r = await adminCall("frappe.client.insert", { doc: { doctype: "ToDo", description: `MF-E2E-LINK-${Date.now()}` } });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  targetName = r.json && typeof r.json === "object" && "message" in r.json ? (r.json as { message: { name: string } }).message.name : undefined;
});

test.afterAll(async () => {
  if (targetName) await adminCall("frappe.client.delete", { doctype: "ToDo", name: targetName }).catch(() => {});
});

test("Dynamic Link (reference_name) chưa có reference_type → khoá + hướng dẫn, KHÔNG phải input tự do (LIVE)", async ({ page }) => {
  await page.goto(`/app/ToDo/${encodeURIComponent(targetName!)}`);
  await page.locator("#mf-description").waitFor({ state: "visible", timeout: 20_000 });

  const dynLink = page.locator("#mf-reference_name");
  await dynLink.waitFor({ state: "visible", timeout: 15_000 });
  await expect(dynLink).toContainText("reference_type");
  // KHÔNG phải input thường (là <div> chẩn đoán) — xác nhận qua tagName thay vì input tự do.
  const tag = await dynLink.evaluate((el) => el.tagName.toLowerCase());
  expect(tag, "phần tử reference_name phải là div chẩn đoán, không phải input").not.toBe("input");
});
