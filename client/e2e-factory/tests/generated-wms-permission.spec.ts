import { test, expect } from "@playwright/test";

/**
 * P1-PERM-01 (LIVE) — effective capabilities phải chặn UI (field editability + Create/bulk-Delete),
 * KHÔNG chỉ ẩn nút Lưu. Chạy qua serve-proxy-cookie.mjs (cookie-session THẬT, tái dùng hạ tầng
 * Phase 1 — KHÔNG Administrator trong chính kịch bản test).
 *
 * PHÁT HIỆN LIVE (2 vòng, chọn doctype "Note" thay ToDo):
 * 1. "All" role cấp full CRUD trên ToDo (xem generated-wms-cookie-auth.spec.ts) ⇒ không có cách nào
 *    tạo user "chỉ đọc" ToDo qua permission chuẩn. "Note" có role "Desk User" (standard Frappe role,
 *    desk_access=1, KHÔNG cần tạo Role riêng): permlevel 0 read=1,write=0,create=0,delete=0
 *    (if_owner=0) + 1 hàng khác if_owner=1,write=1,create=1,delete=1 (chỉ áp cho doc DO USER SỞ HỮU).
 * 2. Vòng đầu Note tạo với `public` mặc định (0) → get_capabilities trả TOÀN BỘ false (kể cả read!)
 *    cho user KHÔNG sở hữu — verify trực tiếp bằng curl+cookie jar mới phát hiện: Note có kiểm tra
 *    RIÊNG (ngoài DocPerm) — note PRIVATE (`public=0`) chỉ owner đọc được, bất kể DocPerm nói read=1.
 *    Đặt `public: 1` khi tạo → read=true,write=false,create=true,delete=false ĐÚNG như DocPerm mô tả.
 *    Bài học: KHÔNG suy permission chỉ từ bảng DocPerm — luôn verify qua CHÍNH get_capabilities
 *    (nguồn UI thật dùng) trên site thật trước khi viết assertion, như đã làm ở đây.
 */

const ADMIN_BACKEND = process.env.MF_BACKEND || "http://127.0.0.1:8000";
const ADMIN_TOKEN = process.env.MF_TOKEN;
const SITE = process.env.MF_SITE || "metaforge.localhost";
if (!ADMIN_TOKEN) {
  throw new Error(
    "MF_TOKEN required (Administrator) — dùng DUY NHẤT để tạo/xoá fixture (user hạn chế + Note). " +
      "Chính kịch bản E2E bên dưới KHÔNG dùng token này.",
  );
}

const STAMP = Date.now();
const RESTRICTED_USER = `mf-e2e-perm-${STAMP}@example.test`;
const RESTRICTED_PWD = `Mf!Perm${STAMP}Xq9`;

interface AdminCallResult { status: number; json: any }
async function adminCall(method: string, body?: Record<string, unknown>): Promise<AdminCallResult> {
  const url = new URL(`${ADMIN_BACKEND}/api/method/${method}`);
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `token ${ADMIN_TOKEN}`, "X-Frappe-Site-Name": SITE, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, json };
}

let targetNoteName: string | undefined;

test.describe.serial("Effective permissions propagate through UI (LIVE, P1-PERM-01)", () => {
  test.beforeAll(async () => {
    // "Desk User" — role CHUẨN có sẵn, không cần tạo Role riêng (khác Phase 1: ở đây mục tiêu là
    // permission THẬT của 1 role thật, không phải role rỗng tự tạo).
    const user = await adminCall("frappe.client.insert", {
      doc: {
        doctype: "User", email: RESTRICTED_USER, first_name: "MF E2E Perm", send_welcome_email: 0,
        user_type: "System User", new_password: RESTRICTED_PWD, roles: [{ role: "Desk User" }],
      },
    });
    expect(user.status, `create User: ${JSON.stringify(user.json)}`).toBe(200);

    // owner = Administrator (KHÔNG phải restricted user) ⇒ if_owner=1 KHÔNG áp ⇒ user hạn chế chỉ
    // còn hàng read=1,write=0 — read-only THẬT, không phải "chưa test đúng nhánh if_owner".
    // public=1 BẮT BUỘC (xem docblock điểm 2) — Note private (mặc định public=0) chỉ owner đọc được,
    // bất kể DocPerm, verify trực tiếp qua get_capabilities trước khi chốt test này.
    const note = await adminCall("frappe.client.insert", { doc: { doctype: "Note", title: `MF-E2E-PERM-${STAMP}`, content: "seed", public: 1 } });
    expect(note.status, `create target Note: ${JSON.stringify(note.json)}`).toBe(200);
    targetNoteName = note.json?.message?.name;
  });

  test.afterAll(async () => {
    if (targetNoteName) await adminCall("frappe.client.delete", { doctype: "Note", name: targetNoteName }).catch(() => {});
    await adminCall("frappe.client.delete", { doctype: "User", name: RESTRICTED_USER }).catch(() => {});
  });

  test("caps thật cho user hạn chế trên Note KHÔNG-sở-hữu: write=false (điểm neo cho mọi assertion dưới)", async ({ page }) => {
    await page.goto("/");
    await page.locator("#mf-login-usr").fill(RESTRICTED_USER);
    await page.locator("#mf-login-pwd").fill(RESTRICTED_PWD);
    await page.getByRole("button", { name: /đăng nhập/i }).click();
    await expect(page.locator("#mf-login-usr")).toHaveCount(0, { timeout: 20_000 }); // đã qua guest

    const caps = await page.request.get(`/api/method/metaforge.api.get_capabilities?doctype=Note&name=${targetNoteName}`);
    expect(caps.status()).toBe(200);
    const c = (await caps.json()).message;
    expect(c.read, JSON.stringify(c)).toBe(true);
    expect(c.write, JSON.stringify(c)).toBe(false); // neo chính — nếu Frappe đổi hành vi, test sau sẽ sai rõ ràng chứ không giả
  });

  test("form field KHÔNG sửa được khi caps.write=false (forceReadOnly, không chỉ ẩn nút Lưu)", async ({ page }) => {
    await page.goto("/");
    await page.locator("#mf-login-usr").fill(RESTRICTED_USER);
    await page.locator("#mf-login-pwd").fill(RESTRICTED_PWD);
    await page.getByRole("button", { name: /đăng nhập/i }).click();
    // waitForURL (KHÔNG toHaveCount(0) trên login form) — login form biến mất NGAY khi rời guest
    // (đã bắt đầu "loading"), CHƯA chắc boot xong; page.goto() ngay sau đó sẽ race với boot đang
    // dang dở. waitForURL chỉ resolve sau khi boot THẬT xong và redirect home — an toàn để goto tiếp.
    await page.waitForURL(/\/app\/ToDo/, { timeout: 20_000 });

    await page.goto(`/app/Note/${encodeURIComponent(targetNoteName!)}`);
    // "title" (fieldtype Data → <Input> thường, giống #mf-description ở ToDo) — KHÔNG dùng "content"
    // (Text Editor/rich-text, DOM readOnly/disabled không áp dụng trực tiếp như input thường).
    const titleField = page.locator("#mf-title");
    await titleField.waitFor({ state: "visible", timeout: 20_000 });
    // KHÔNG chỉ nút Lưu ẩn — chính input phải bị khoá (P1-PERM-01: trước đây field vẫn gõ được, chỉ
    // nút hành động bị gate). readonly HOẶC disabled đều tính là "không sửa được".
    const isLocked = await titleField.evaluate((el) => (el as HTMLInputElement).readOnly || (el as HTMLInputElement).disabled);
    expect(isLocked, "field title phải readOnly/disabled khi caps.write=false").toBeTruthy();
    // KHÔNG có nút Lưu khả dụng (perms.write=false → resolveFormActions cũng chặn — regression giữ nguyên).
    await expect(page.getByRole("button", { name: /^lưu|save/i })).toHaveCount(0);
  });

  test("server VẪN từ chối ghi trực tiếp dù bypass UI (server là ranh giới cuối, không chỉ dựa client)", async ({ page }) => {
    await page.goto("/");
    await page.locator("#mf-login-usr").fill(RESTRICTED_USER);
    await page.locator("#mf-login-pwd").fill(RESTRICTED_PWD);
    await page.getByRole("button", { name: /đăng nhập/i }).click();
    await page.waitForURL(/\/app\/ToDo/, { timeout: 20_000 });

    const put = await page.request.put(`/api/resource/Note/${encodeURIComponent(targetNoteName!)}`, { data: { content: "bypass attempt" } });
    expect(put.status(), "server phải từ chối ghi — user không có quyền write trên Note này").not.toBe(200);
  });

  test("List: Tạo mới HIỆN (create=true qua if_owner) nhưng Xoá hàng loạt ẨN (delete=false) — gate 2 chiều", async ({ page }) => {
    // Cặp đối lập THẬT của chính user/doctype này (đã verify: get_capabilities doctype=Note (không
    // name, cấp doctype cho List) → create=true qua hàng if_owner của DocPerm, delete=false vì
    // KHÔNG có hàng nào cho phép delete non-owner) — chứng minh gate KHÔNG phải "luôn ẩn hết" mà đi
    // ĐÚNG theo caps thật, cả 2 hướng.
    await page.goto("/");
    await page.locator("#mf-login-usr").fill(RESTRICTED_USER);
    await page.locator("#mf-login-pwd").fill(RESTRICTED_PWD);
    await page.getByRole("button", { name: /đăng nhập/i }).click();
    await page.waitForURL(/\/app\/ToDo/, { timeout: 20_000 });

    await page.goto("/app/Note");
    const row = page.locator("tr[data-index]").first();
    await row.waitFor({ state: "visible", timeout: 20_000 });

    // create=true → nút "Tạo mới" PHẢI hiện (list-header hoặc toolbar).
    await expect(page.getByRole("button", { name: /tạo mới/i }).first()).toBeVisible({ timeout: 10_000 });

    // delete=false → chọn dòng, KHÔNG được có action "Xoá" nào xuất hiện trong bulk-action bar.
    // Checkbox = Radix (<button role="checkbox">), KHÔNG phải <input> gốc.
    await row.getByRole("checkbox").click();
    await expect(page.getByRole("button", { name: /^xoá$|^xóa$/i })).toHaveCount(0);
  });
});
