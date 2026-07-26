import { test, expect } from "@playwright/test";

/**
 * ManifestAppRuntime parity (P1-MANIFEST-01, LIVE) — app SINH RA (sample-wms), main.tsx KHÔNG sửa
 * tay (100% từ template CLI). app-manifest.ts được MỞ RỘNG (route/workspace/system/icon/locale) —
 * đúng cách 1 app author thật sẽ tuỳ biến (README của app sinh ra: "Sửa nav/home tuỳ nghiệp vụ").
 * Chứng minh main.tsx GENERIC tự xử lý đúng, không cần code riêng cho từng kind:
 *   nav: [ToDo(doctype,icon=settings), __workspace(workspace,icon=layout-grid), __about(system), docs(route,/docs)]
 *   locale: { currency: "USD" }
 * Trước sửa (P1-MANIFEST-01): MỌI nav item bị gửi tới /app/<key> bất kể kind (workspace/route/system
 * bị coi NGẦM là DocType) → 404/mis-route; icon bị bỏ; locale override bị bỏ qua hoàn toàn.
 */

test("kind=doctype không đổi hành vi (regression) — vẫn vào ToDo qua home", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/app\/ToDo/, { timeout: 20_000 });
});

test("kind=workspace → WorkspaceContainer THẬT (không phải DocType 404)", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/app\/ToDo/, { timeout: 20_000 });
  // click nav "Workspace" (sidebar) — resolveNavPath phải trả "/workspace", KHÔNG "/app/__workspace".
  await page.getByRole("button", { name: "Workspace" }).click();
  await expect(page).toHaveURL(/\/workspace$/, { timeout: 15_000 });
  // KHÔNG rơi vào NotImplementedScreen (đó là fallback cho route/system, không phải workspace).
  await expect(page.getByText(/chưa có component riêng/i)).toHaveCount(0);
});

test("kind=route (docs) → route THẬT tồn tại (placeholder, không 404/không redirect loop)", async ({ page }) => {
  await page.goto("/docs");
  // ĐỨNG YÊN ở /docs — không bị catch-all bounce về home (đó chính là bug P1-MANIFEST-01 gốc).
  await expect(page).toHaveURL(/\/docs$/, { timeout: 15_000 });
  // chuỗi placeholder chứa ĐÚNG label khai báo trong manifest ("Tài liệu") — label cũng xuất hiện ở
  // sidebar/breadcrumb nên KHÔNG dùng getByText rời (strict-mode nhiều khớp); match nguyên câu.
  await expect(page.getByText('Màn "Tài liệu" chưa có component riêng')).toBeVisible();
});

test("kind=system (__about → /about) → route THẬT tồn tại, KHÔNG bị coi là DocType", async ({ page }) => {
  await page.goto("/about");
  await expect(page).toHaveURL(/\/about$/, { timeout: 15_000 });
  // PHẢN CHỨNG bug gốc: nếu runtime cũ coi "__about" là doctype, nó sẽ gọi getdoctype("__about") và
  // app sẽ kẹt ở trạng thái lỗi/loading, KHÔNG render placeholder với ĐÚNG label "Giới thiệu".
  await expect(page.getByText('Màn "Giới thiệu" chưa có component riêng')).toBeVisible();
});

test("locale override (currency: USD trong manifest) không làm vỡ boot/render (LIVE)", async ({ page }) => {
  // Đúng logic merge (numberFormat/dateFormat vẫn theo boot.sysdefaults, chỉ currency bị ép) đã
  // verify THUẦN ở selfcheck (mergeLocale) — bài LIVE này xác nhận override thật sự được truyền qua
  // MetaForgeProvider (boot.sysdefaults → mergeLocale(..., APP_MANIFEST.locale)) mà KHÔNG crash app;
  // ToDo (doctype dùng cho fixture) không có field Currency nên không có điểm hiển thị trực quan để
  // assert giá trị format — ghi rõ giới hạn phạm vi, không giả vờ đã chứng minh hơn thế.
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("/");
  await expect(page).toHaveURL(/\/app\/ToDo/, { timeout: 20_000 });
  await expect(page.locator("table, [role='table'], .cursor-pointer").first()).toBeVisible({ timeout: 15_000 });
  const fatal = errors.filter((e) => !/favicon|React DevTools|ResizeObserver/i.test(e));
  expect(fatal, fatal.join("\n")).toHaveLength(0);
});

test("createScopeKey (P2-CACHE-01): boot trả site_name+frappe_version THẬT, app dùng để ghép scopeKey không crash (LIVE)", async ({ page }) => {
  // Trước fix: scopeKey = `${user}|${lang}|16` (hằng số "16" đoán, KHÔNG site) — 2 site khác nhau
  // dùng chung trình duyệt sẽ đụng cache. Bài test này xác nhận: (1) boot THẬT trả site_name/
  // frappe_version (không phải field rỗng/thiếu), (2) app dùng createScopeKey(boot) mà KHÔNG vỡ boot/
  // render (nếu ghép sai kiểu — vd field undefined lọt vào scopeKey — TanStack Query key vẫn hoạt động
  // vì chỉ là chuỗi, nên điểm neo THẬT là boot response có đúng field, đã pure-test logic ghép ở
  // selfcheck (createScopeKey: cách ly theo site+user+lang+version)).
  let bootBody: { site_name?: string; frappe_version?: string; user?: string } | undefined;
  page.on("response", async (r) => {
    if (r.url().includes("get_boot")) {
      try { bootBody = (await r.json())?.message; } catch { /* ignore non-JSON */ }
    }
  });
  await page.goto("/");
  await expect(page).toHaveURL(/\/app\/ToDo/, { timeout: 20_000 });
  await page.waitForTimeout(1000);
  expect(bootBody?.site_name, JSON.stringify(bootBody)).toBe("metaforge.localhost");
  expect(bootBody?.frappe_version, JSON.stringify(bootBody)).toMatch(/^\d+\.\d+\.\d+/);
});
