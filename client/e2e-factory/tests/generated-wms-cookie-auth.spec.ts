import { test, expect } from "@playwright/test";

/**
 * Cookie-session E2E cho app SINH RA (P1-AUTH-01) — chạy qua serve-proxy-cookie.mjs (KHÔNG token
 * injection). Chứng minh end-user auth THẬT: guest → login (LoginForm → adapter.login → cookie) →
 * boot/list → sửa được → server TỪ CHỐI thao tác cần System Manager (gọi thẳng API, bỏ qua UI) →
 * đăng xuất → phiên hết hạn giữa lúc dùng (thu hồi Session server-side) tự quay lại guest KHÔNG cần
 * reload trang (adapter.onSessionExpired, xem AuthBoundary).
 *
 * PHÁT HIỆN LIVE (quan trọng, quyết định thiết kế test bên dưới):
 * 1. Role "All" — MỌI user Frappe tự động có, không thể bỏ — đã cấp sẵn read/write/create/delete=1
 *    trên ToDo (`frappe.client.get doctype=DocType name=ToDo` → permissions[role=All]). 1 Custom
 *    DocPerm hạn chế hơn cho 1 role MỚI KHÔNG có tác dụng gì trên ToDo (permission Frappe CỘNG DỒN
 *    qua các role) ⇒ KHÔNG tạo Custom DocPerm trên ToDo trong fixture (sẽ gây hiểu lầm, không đổi gì thật).
 * 2. ToDo có RÀNG BUỘC RIÊNG ngoài DocPerm: dù role "All" cho read/write=1, một user KHÔNG được cấp
 *    `allocated_to` (hoặc không phải owner) của 1 ToDo cụ thể vẫn bị chặn record đó (`getdoc` → 403,
 *    list → rỗng) — đúng ngữ nghĩa nghiệp vụ ToDo (chỉ thấy việc được giao). Vì vậy fixture ToDo dùng
 *    để test "permitted edit" PHẢI set `allocated_to = RESTRICTED_USER` khi tạo, nếu không test sẽ
 *    fail vì lý do SAI (tưởng thiếu quyền write, thật ra là thiếu allocation) — đã verify trực tiếp
 *    bằng debug script trước khi chốt test này.
 * 3. Test "forbidden" đổi sang DocType "Role" — xác nhận LIVE "All" KHÔNG có permission entry nào
 *    trên "Role" (chỉ "System Manager" có) → mục tiêu tin cậy, không phụ thuộc cấu hình ToDo/allocation.
 *
 * Setup/teardown fixture (Role + User hạn chế) dùng token Administrator (MF_TOKEN, CHỈ để dựng/xoá
 * fixture — không dùng cho bất kỳ bước nào của chính E2E, vốn chạy 100% qua cookie session của user
 * hạn chế). Cleanup chạy trong afterAll (best-effort từng bước, không để 1 lỗi chặn các bước dọn còn lại).
 *
 * GHI CHÚ PHẠM VI: đây MỚI kiểm server-side reject (fail-closed đã có từ Gate 1). Việc UI tự ẩn/khoá
 * nút theo effective capabilities là Phase 3 (P1-PERM-01, CHƯA làm ở thời điểm test này) — sẽ mở
 * rộng assertion UI-absence sau khi Phase 3 xong, không giả vờ đã có ở đây.
 */

const ADMIN_BACKEND = process.env.MF_BACKEND || "http://127.0.0.1:8000";
const ADMIN_TOKEN = process.env.MF_TOKEN;
const SITE = process.env.MF_SITE || "metaforge.localhost";
if (!ADMIN_TOKEN) {
  throw new Error(
    "MF_TOKEN required (Administrator) — dùng DUY NHẤT để tạo/xoá fixture (role/perm/user hạn chế). " +
      "Chính kịch bản E2E bên dưới KHÔNG dùng token này.",
  );
}

const STAMP = Date.now();
const ROLE = `MF E2E Restricted ${STAMP}`;
const RESTRICTED_USER = `mf-e2e-restricted-${STAMP}@example.test`;
const RESTRICTED_PWD = `Mf!Restricted${STAMP}Xq9`;
// user thứ 2, dùng riêng cho test stale-boot-cache (review 453d322) — cần identity KHÁC RESTRICTED_USER
// để phân biệt boot NÀO (A hay B) thật sự tới từ mạng, không phải suy diễn từ UI.
const RESTRICTED_USER_2 = `mf-e2e-restricted2-${STAMP}@example.test`;
const RESTRICTED_PWD_2 = `Mf!Restricted2${STAMP}Xq9`;

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

let targetTodoName: string | undefined;
/** chỉ dọn nếu test "forbidden" nào đó bất ngờ TẠO ĐƯỢC role này (không nên xảy ra — xem docblock). */
let unexpectedForbiddenRoleName: string | undefined;

test.describe.serial("Restricted-user cookie-session auth (LIVE, P1-AUTH-01)", () => {
  test.beforeAll(async () => {
    const role = await adminCall("frappe.client.insert", { doc: { doctype: "Role", role_name: ROLE, desk_access: 1 } });
    expect(role.status, `create Role: ${JSON.stringify(role.json)}`).toBe(200);

    const user = await adminCall("frappe.client.insert", {
      doc: {
        doctype: "User", email: RESTRICTED_USER, first_name: "MF E2E Restricted", send_welcome_email: 0,
        user_type: "System User", new_password: RESTRICTED_PWD, roles: [{ role: ROLE }],
      },
    });
    expect(user.status, `create User: ${JSON.stringify(user.json)}`).toBe(200);

    const user2 = await adminCall("frappe.client.insert", {
      doc: {
        doctype: "User", email: RESTRICTED_USER_2, first_name: "MF E2E Restricted 2", send_welcome_email: 0,
        user_type: "System User", new_password: RESTRICTED_PWD_2, roles: [{ role: ROLE }],
      },
    });
    expect(user2.status, `create User 2: ${JSON.stringify(user2.json)}`).toBe(200);

    // allocated_to = RESTRICTED_USER: ToDo áp ràng buộc RIÊNG ngoài DocPerm (chỉ thấy việc được giao,
    // xem docblock điểm 2) — thiếu dòng này getdoc/list sẽ 403/rỗng dù role "All" cho write=1.
    const todo = await adminCall("frappe.client.insert", {
      doc: { doctype: "ToDo", description: `MF-E2E-COOKIE-${STAMP}`, allocated_to: RESTRICTED_USER },
    });
    expect(todo.status, `create target ToDo: ${JSON.stringify(todo.json)}`).toBe(200);
    targetTodoName = todo.json?.message?.name;
  });

  test.afterAll(async () => {
    // best-effort — mỗi bước độc lập, 1 lỗi KHÔNG chặn các bước dọn còn lại.
    if (targetTodoName) await adminCall("frappe.client.delete", { doctype: "ToDo", name: targetTodoName }).catch(() => {});
    if (unexpectedForbiddenRoleName) await adminCall("frappe.client.delete", { doctype: "Role", name: unexpectedForbiddenRoleName }).catch(() => {});
    await adminCall("frappe.client.delete", { doctype: "User", name: RESTRICTED_USER }).catch(() => {});
    await adminCall("frappe.client.delete", { doctype: "User", name: RESTRICTED_USER_2 }).catch(() => {});
    await adminCall("frappe.client.delete", { doctype: "Role", name: ROLE }).catch(() => {});
  });

  test("guest → login form → cookie login → boot/list live", async ({ page }) => {
    await page.goto("/");
    // Guest: KHÔNG có session cookie → AuthBoundary render LoginForm (KHÔNG tự vào được app).
    await expect(page.locator("#mf-login-usr")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#mf-login-pwd")).toBeVisible();

    await page.locator("#mf-login-usr").fill(RESTRICTED_USER);
    await page.locator("#mf-login-pwd").fill(RESTRICTED_PWD);
    await page.getByRole("button", { name: /đăng nhập/i }).click();

    // Login thành công → cookie session thật → AuthBoundary retry boot → vào app (redirect home /app/ToDo).
    await expect(page).toHaveURL(/\/app\/ToDo/, { timeout: 20_000 });
    await expect(page.locator("#mf-login-usr")).toHaveCount(0);

    // Effective capabilities THẬT cho user hạn chế (server fail-closed, không optimistic):
    // - ToDo: write=true qua role "All" (baseline mọi user, xem docblock).
    // - Role: MỌI thứ false — "All" không có permission entry nào trên Role (chỉ System Manager).
    const todoCaps = await page.request.get(`/api/method/metaforge.api.get_capabilities?doctype=ToDo`);
    expect(todoCaps.status()).toBe(200);
    expect((await todoCaps.json()).message?.write, "ToDo write qua role All").toBe(true);

    const roleCaps = await page.request.get(`/api/method/metaforge.api.get_capabilities?doctype=Role`);
    expect(roleCaps.status()).toBe(200);
    const roleCapsBody = await roleCaps.json();
    expect(roleCapsBody.message?.create, JSON.stringify(roleCapsBody)).toBe(false);
    expect(roleCapsBody.message?.read, JSON.stringify(roleCapsBody)).toBe(false);
  });

  test("permitted edit succeeds (write qua role All)", async ({ page }) => {
    await page.goto("/");
    await page.locator("#mf-login-usr").fill(RESTRICTED_USER);
    await page.locator("#mf-login-pwd").fill(RESTRICTED_PWD);
    await page.getByRole("button", { name: /đăng nhập/i }).click();
    await expect(page).toHaveURL(/\/app\/ToDo/, { timeout: 20_000 });

    await page.goto(`/app/ToDo/${encodeURIComponent(targetTodoName!)}`);
    const ta = page.locator("#mf-description");
    await ta.waitFor({ state: "visible", timeout: 20_000 });
    const stamp2 = `edited-by-restricted-${Date.now()}`;
    await ta.fill(stamp2);
    const savePromise = page.waitForResponse((r) => /\/api\/resource\/ToDo\//.test(r.url()) && r.request().method() === "PUT", { timeout: 20_000 });
    await page.getByRole("button", { name: /^lưu|save/i }).first().click();
    const saveResp = await savePromise;
    expect(saveResp.status(), "restricted user (write=1) lưu thành công").toBe(200);
  });

  test("forbidden action rejected by SERVER (System Manager-only) — direct API attempt, bypass UI", async ({ page }) => {
    await page.goto("/");
    await page.locator("#mf-login-usr").fill(RESTRICTED_USER);
    await page.locator("#mf-login-pwd").fill(RESTRICTED_PWD);
    await page.getByRole("button", { name: /đăng nhập/i }).click();
    await expect(page).toHaveURL(/\/app\/ToDo/, { timeout: 20_000 });

    // Gọi THẲNG API tạo Role (bỏ qua UI hoàn toàn) — chỉ System Manager mới có quyền, "All" (baseline
    // mọi user) KHÔNG có permission entry nào trên Role (xác nhận LIVE ở docblock) → server PHẢI từ
    // chối dù request có cookie session hợp lệ.
    const attemptedRole = `MF Should Not Exist ${STAMP}`;
    const ins = await page.request.post("/api/method/frappe.client.insert", { data: { doc: { doctype: "Role", role_name: attemptedRole } } });
    expect(ins.status(), "server phải từ chối tạo Role — user không có quyền System Manager").not.toBe(200);
    if (ins.status() === 200) unexpectedForbiddenRoleName = attemptedRole; // phòng hờ, để afterAll dọn nếu có
  });

  test("logout → quay lại guest (login form)", async ({ page }) => {
    await page.goto("/");
    await page.locator("#mf-login-usr").fill(RESTRICTED_USER);
    await page.locator("#mf-login-pwd").fill(RESTRICTED_PWD);
    await page.getByRole("button", { name: /đăng nhập/i }).click();
    await expect(page).toHaveURL(/\/app\/ToDo/, { timeout: 20_000 });

    await page.getByRole("button", { name: "Tài khoản" }).click();
    await page.getByText(/đăng xuất/i).click();
    await expect(page.locator("#mf-login-usr")).toBeVisible({ timeout: 15_000 });
  });

  test("logout → login user KHÁC cùng tab → boot MỚI thật qua mạng, không dính cache user cũ (review 453d322, AuthBoundary bootPromises)", async ({ page }) => {
    // Bug thật ĐÃ FIX: bootPromises (WeakMap theo adapter instance) chỉ bị xoá khi getBoot() LỖI —
    // boot thành công thì cache SỐNG VĨNH VIỄN. logout() không xoá → login lại (dù user khác, CÙNG
    // TAB nên CÙNG adapter instance) trả lại promise ĐÃ RESOLVE của user cũ, KHÔNG gọi get_boot lần
    // 2 qua mạng. Bắt bằng cách đếm response network THẬT tới get_boot, không suy diễn qua UI.
    const bootResponses: Array<{ user?: string }> = [];
    page.on("response", (res) => {
      if (!/\/api\/method\/metaforge\.api\.get_boot/.test(res.url())) return;
      // CHỈ 200 — AuthBoundary tự gọi getBoot() lúc CÒN guest (trước khi form login hiện xong) và
      // luôn nhận 403 PermissionError ("Login to access…") lúc đó (hành vi Frappe đã biết, xem
      // mapError §0); response lỗi này KHÔNG phải boot thật của user, bỏ qua để không lẫn vào chuỗi.
      if (!res.ok()) return;
      res
        .json()
        .then((json) => bootResponses.push(json?.message ?? json))
        .catch(() => {});
    });

    await page.goto("/");
    await page.locator("#mf-login-usr").fill(RESTRICTED_USER);
    await page.locator("#mf-login-pwd").fill(RESTRICTED_PWD);
    await page.getByRole("button", { name: /đăng nhập/i }).click();
    await expect(page).toHaveURL(/\/app\/ToDo/, { timeout: 20_000 });
    await expect(page.locator("#mf-login-usr")).toHaveCount(0);
    await expect.poll(() => bootResponses.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    expect(bootResponses[0]?.user, JSON.stringify(bootResponses)).toBe(RESTRICTED_USER);

    await page.getByRole("button", { name: "Tài khoản" }).click();
    await page.getByText(/đăng xuất/i).click();
    await expect(page.locator("#mf-login-usr")).toBeVisible({ timeout: 15_000 });

    await page.locator("#mf-login-usr").fill(RESTRICTED_USER_2);
    await page.locator("#mf-login-pwd").fill(RESTRICTED_PWD_2);
    await page.getByRole("button", { name: /đăng nhập/i }).click();
    await expect(page).toHaveURL(/\/app\/ToDo/, { timeout: 20_000 });
    await expect(page.locator("#mf-login-usr")).toHaveCount(0);

    // Với bug cũ: KHÔNG có response thứ 2 (cache hit, không ra mạng) → poll timeout, test fail đúng chỗ.
    await expect
      .poll(() => bootResponses.length, { timeout: 15_000 })
      .toBeGreaterThanOrEqual(2);
    const lastBoot = bootResponses[bootResponses.length - 1];
    expect(
      lastBoot?.user,
      `boot lần 2 (sau khi đổi user cùng tab) PHẢI mang identity user MỚI — nhận: ${JSON.stringify(bootResponses)}`,
    ).toBe(RESTRICTED_USER_2);
  });

  test("session hết hạn GIỮA lúc dùng → tự quay lại guest KHÔNG reload (onSessionExpired)", async ({ page }) => {
    await page.goto("/");
    await page.locator("#mf-login-usr").fill(RESTRICTED_USER);
    await page.locator("#mf-login-pwd").fill(RESTRICTED_PWD);
    await page.getByRole("button", { name: /đăng nhập/i }).click();
    await expect(page).toHaveURL(/\/app\/ToDo/, { timeout: 20_000 });
    await expect(page.locator("#mf-login-usr")).toHaveCount(0);
    const row = page.locator("tr[data-index]").first();
    await row.waitFor({ state: "visible", timeout: 20_000 });

    // Vô hiệu session TỪ GÓC NHÌN TRÌNH DUYỆT: xoá cookie sid (KHÔNG page.goto/reload — tab vẫn đang
    // mở, React app vẫn sống trong bộ nhớ, KHÔNG re-mount lại từ đầu). "Sessions" không phải DocType
    // truy vấn được qua REST ở bản Frappe này (`frappe.client.get_list` → 404 DoesNotExistError, đã
    // verify live) nên không thu hồi qua DB được; xoá cookie tạo ra CHÍNH XÁC cùng điều kiện server
    // nhìn thấy (request tiếp theo KHÔNG có sid hợp lệ → 401 AuthenticationError) — đúng cái
    // onSessionExpired cần bắt, bất kể lý do gốc là hết hạn/thu hồi/cookie hỏng.
    await page.context().clearCookies();

    // Click 1 hàng ĐÃ RENDER SẴN (SPA client nav, gọi getDoc qua adapter ĐANG SỐNG trong tab hiện tại,
    // KHÔNG phải boot lại từ đầu) → axios interceptor phát hiện 401 → onSessionExpired → quay lại guest
    // NGAY. Đây mới thật sự kiểm cơ chế giữa-phiên (khác test đầu = guest-detect lúc boot ban đầu).
    await row.click();
    await expect(page.locator("#mf-login-usr")).toBeVisible({ timeout: 20_000 });
  });
});
