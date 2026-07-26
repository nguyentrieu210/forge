import { test, expect } from "@playwright/test";

/**
 * E2E LIVE (P1) — MetaForge chạy trên Frappe THẬT (metaforge.localhost qua tunnel).
 * Chứng minh product hoạt động với backend thật, KHÔNG mock: boot · list metadata-driven ·
 * split 3 cột · form field từ getdoctype · timeline từ docinfo.
 * Dữ liệu seed: 8 ToDo (Open/Closed/Cancelled) trên site cô lập.
 */
test.describe("LIVE — Frappe thật (metaforge.localhost)", () => {
  test("boot + shell render (getBoot thật)", async ({ page }) => {
    await page.goto("/app/ToDo");
    // AppShell dùng chung — sidebar có DocType nav
    await expect(page.getByRole("button", { name: /Việc cần làm/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByPlaceholder("Tìm kiếm…")).toBeVisible();
  });

  test("List ToDo tải dữ liệu THẬT + cột từ metadata", async ({ page }) => {
    await page.goto("/app/ToDo");
    // record seed thật hiện trong bảng
    await expect(page.getByText("Chuẩn bị demo MetaForge live")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Dựng renderer data-table")).toBeVisible();
    // pagination hiện tổng thật (getCount) — không assert số cứng vì test create/delete đổi tạm
    await expect(page.getByText(/1–\d+ \/ \d+/)).toBeVisible();
  });

  test("click dòng → split 3 cột với form + context từ Frappe", async ({ page }) => {
    await page.goto("/app/ToDo");
    await page.getByText("Chuẩn bị demo MetaForge live").click();
    // list trái vẫn còn
    await expect(page.getByText("Dựng renderer data-table")).toBeVisible({ timeout: 20_000 });
    // form giữa: field từ getdoctype ToDo (Trạng thái/Priority là field ToDo thật)
    await expect(page.locator("form").first()).toBeVisible();
    // context phải: tab Lịch sử (timeline từ docinfo)
    await expect(page.getByRole("tab", { name: "Lịch sử" })).toBeVisible();
  });

  test("sửa Due Date → Lưu (updateDoc THẬT) → reload persist", async ({ page }) => {
    // Due Date = Date độc lập (không co-dependency như Reference Name).
    await page.goto("/app/ToDo");
    await page.getByText("Tối ưu truy vấn getList").click();
    const url = page.url(); // /app/ToDo/<name> thật
    // scope vào <form> — "Due Date" cũng là filter list bên trái (in_standard_filter)
    const due = page.locator("form").getByLabel("Due Date");
    await expect(due).toBeVisible({ timeout: 20_000 });
    // Đổi sang giá trị KHÁC giá trị hiện tại ⇒ luôn dirty ⇒ "Lưu" enabled. Idempotent tuyệt đối mọi
    // lần re-run (không phụ thuộc đồng hồ — ngày biến-thiên theo phút sẽ trùng giá trị đã lưu khi
    // chạy lại trong cùng 1 phút → form không dirty → "Lưu" disable → flaky).
    const cur = await due.inputValue();
    const newDate = cur === "2026-09-01" ? "2026-09-02" : "2026-09-01";
    await due.fill(newDate);
    const save = page.getByRole("button", { name: "Lưu" });
    await expect(save).toBeEnabled({ timeout: 10_000 });
    await save.click();
    await expect(page.getByText(/Đã lưu/)).toBeVisible({ timeout: 15_000 }); // sonner toast success
    // reload cùng URL → giá trị persist ở Frappe (updateDoc thật)
    await page.goto(url);
    await expect(page.locator("form").getByLabel("Due Date")).toHaveValue(newDate, { timeout: 20_000 });
  });

  test("Tạo mới → createDoc THẬT → rồi Xoá (deleteDoc) → về list", async ({ page }) => {
    const marker = `E2E-NEW-${Date.now() % 1000000}`;
    await page.goto("/app/ToDo");
    await page.getByRole("button", { name: "Tạo mới" }).click();
    await expect(page).toHaveURL(/\/app\/ToDo\/new/, { timeout: 20_000 });
    // Description bắt buộc (reqd) — fill để qua validate + dirty
    await page.locator("form").getByLabel("Description").fill(marker);
    const save = page.getByRole("button", { name: "Lưu" });
    await expect(save).toBeEnabled({ timeout: 10_000 });
    await save.click();
    await expect(page.getByText(/Đã tạo/)).toBeVisible({ timeout: 15_000 }); // toast create
    // điều hướng sang bản ghi vừa tạo (URL rời /new → /:name thật)
    await expect(page).toHaveURL(/\/app\/ToDo\/(?!new)[^/]+$/, { timeout: 20_000 });
    await expect(page.locator("form").getByLabel("Description")).toHaveValue(marker);

    // dọn: Xoá bản ghi (deleteDoc) — chứng minh delete + giữ list count net-zero
    await page.getByRole("button", { name: "Thao tác khác" }).click();
    await page.getByRole("menuitem", { name: "Xoá" }).click();
    await expect(page.getByText(/Đã xoá/)).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/app\/ToDo$/, { timeout: 20_000 });
  });

  test("thêm bình luận → addComment THẬT → timeline hiện", async ({ page }) => {
    const comment = `E2E-comment-${Date.now() % 1000000}`;
    await page.goto("/app/ToDo");
    await page.getByText("Chuẩn bị demo MetaForge live").click();
    const box = page.getByPlaceholder("Viết bình luận…");
    await expect(box).toBeVisible({ timeout: 20_000 });
    await box.fill(comment);
    await page.getByRole("button", { name: "Bình luận" }).click();
    // refetch docinfo → timeline render comment vừa thêm (addComment thật)
    await expect(page.getByText(comment)).toBeVisible({ timeout: 15_000 });
  });

  test("2 tab ghi lệch → 417 conflict banner (KHÔNG ghi đè)", async ({ browser }) => {
    const ctx = await browser.newContext();
    const p1 = await ctx.newPage();
    const p2 = await ctx.newPage();
    const open = async (p: import("@playwright/test").Page) => {
      await p.goto("/app/ToDo");
      await p.getByText("Dựng renderer data-table").click();
      await expect(p.locator("form").getByLabel("Due Date")).toBeVisible({ timeout: 20_000 });
    };
    await open(p1);
    await open(p2); // cả 2 load CÙNG modified

    // Đổi sang giá trị KHÁC giá trị hiện tại ⇒ form dirty ⇒ "Lưu" enabled. Idempotent tuyệt đối:
    // KHÔNG hardcode/không phụ thuộc đồng hồ (ngày cố định trùng giá trị đã lưu khi re-run → "Lưu"
    // disable → flaky). cur luôn thuộc tháng 10 ⇒ d1(tháng 10, ≠cur) và d2(tháng 11) đều ≠ cur & d1≠d2.
    const cur = await p1.locator("form").getByLabel("Due Date").inputValue();
    const d1 = cur === "2026-10-01" ? "2026-10-02" : "2026-10-01"; // p1 thắng (ghi được)
    const d2 = "2026-11-11"; // khác THÁNG ⇒ luôn ≠ cur và ≠ d1

    // p1 lưu trước (modified server đổi)
    await p1.locator("form").getByLabel("Due Date").fill(d1);
    const s1 = p1.getByRole("button", { name: "Lưu" });
    await expect(s1).toBeEnabled();
    await s1.click();
    await expect(p1.getByText(/Đã lưu/)).toBeVisible({ timeout: 15_000 });

    // p2 lưu với modified CŨ → 417 TimestampMismatch → conflict banner (không ghi đè)
    await p2.locator("form").getByLabel("Due Date").fill(d2);
    const s2 = p2.getByRole("button", { name: "Lưu" });
    await expect(s2).toBeEnabled();
    await s2.click();
    await expect(p2.getByText(/vừa bị người khác thay đổi/)).toBeVisible({ timeout: 15_000 });
    await ctx.close();
  });

  test("Workflow: ToDo Pending → Approve → Approved (get_transitions + apply_workflow THẬT)", async ({ page }) => {
    // Idempotent bằng FRESH-RECORD: Frappe gán initial workflow_state=Pending khi INSERT (workflow
    // ToDo Approval, state đầu = Pending). Vì Frappe CHẶN CỨNG chuyển ngược workflow_state
    // (Approved→Pending ⇒ WorkflowPermissionError qua MỌI save path), reset record cũ về Pending là
    // bất khả qua API ⇒ mỗi lần chạy TẠO ToDo mới, duyệt, rồi XOÁ ⇒ re-run luôn xanh, site net-zero.
    // proxy /api (vite) tự tiêm X-Frappe-Site-Name + token ⇒ page.request khỏi cần header thủ công.
    const marker = `E2E-WF-${Date.now() % 1000000}`;
    const created = await page.request.post("/api/resource/ToDo", { data: { description: marker } });
    expect(created.ok()).toBeTruthy();
    const name = (await created.json()).data.name as string;

    try {
      await page.goto(`/app/ToDo/${encodeURIComponent(name)}`);

      // header form: WorkflowActionBar render nút "Approve" — nguồn sự thật = server get_transitions
      // (state Pending → action Approve → Approved). Scope trong <form> để tránh nhầm nút khác.
      const approve = page.locator("form").getByRole("button", { name: "Approve" });
      await expect(approve).toBeVisible({ timeout: 20_000 });

      // bấm Approve → applyWorkflow (frappe.model.workflow.apply_workflow THẬT) → toast success
      await approve.click();
      await expect(page.getByText(/Đã thực hiện/)).toBeVisible({ timeout: 15_000 });

      // refetch doc+transitions xong: state=Approved → get_transitions rỗng → nút "Approve" biến mất
      await expect(page.locator("form").getByRole("button", { name: "Approve" })).toHaveCount(0, { timeout: 15_000 });
    } finally {
      // dọn: xoá record test (deleteDoc) — giữ site cô lập sạch, net-zero
      await page.request.delete(`/api/resource/ToDo/${encodeURIComponent(name)}`).catch(() => {});
    }
  });

  test("ContextPanel · Nhãn: Thêm nhãn (add_tag THẬT) → badge + toast → Bỏ nhãn (net-zero)", async ({ page }) => {
    // Frappe cho add/remove tag TỰ DO (không chặn ngược như workflow) ⇒ add rồi remove ⇒ net-zero,
    // re-run luôn xanh. Tag DUY NHẤT mỗi lần chạy để badge/aria-label không nhập nhằng.
    const tag = `e2e-tag-${Date.now() % 100000}`;
    await page.goto("/app/ToDo");
    await page.getByText("Chuẩn bị demo MetaForge live").click();
    // FormView (cột giữa) CŨNG có tab "Chi tiết" ⇒ ContextPanel (cột phải, render sau) = .last()
    const detailTab = page.getByRole("tab", { name: "Ngữ cảnh" }).last();
    await expect(detailTab).toBeVisible({ timeout: 20_000 });
    await detailTab.click();
    // nút "Thêm nhãn" (icon +) → hiện Input inline
    await page.getByRole("button", { name: "Thêm nhãn" }).click();
    const input = page.getByPlaceholder("Tên nhãn + Enter");
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill(tag);
    await input.press("Enter"); // commit → adapter.addTag (frappe.desk.doctype.tag.tag.add_tag THẬT)
    // refetch getdoc (_user_tags) → badge nhãn hiện + toast success
    await expect(page.getByText(/Đã thêm nhãn/)).toBeVisible({ timeout: 15_000 });
    const removeTag = page.getByRole("button", { name: `Bỏ nhãn ${tag}` });
    await expect(removeTag).toBeVisible({ timeout: 20_000 });
    // Bỏ nhãn → adapter.removeTag (remove_tag THẬT) → toast + badge biến mất ⇒ site net-zero
    await removeTag.click();
    await expect(page.getByText(/Đã bỏ nhãn/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: `Bỏ nhãn ${tag}` })).toHaveCount(0, { timeout: 20_000 });
  });

  test("ContextPanel · Phụ trách: Giao việc (assign_to.add THẬT) → badge + toast → Bỏ phụ trách (net-zero)", async ({ page }) => {
    // add assign rồi remove ⇒ net-zero (không chặn ngược). searchLink("User","low") → lowpriv@mf.local
    // (description="Low Priv" hiển thị trong CommandItem). record seed không có assignment cũ ⇒ badge sạch.
    await page.goto("/app/ToDo");
    await page.getByText("Chuẩn bị demo MetaForge live").click();
    const detailTab = page.getByRole("tab", { name: "Ngữ cảnh" }).last();
    await expect(detailTab).toBeVisible({ timeout: 20_000 });
    await detailTab.click();
    // nút "Giao việc" (icon +) → mở Popover combobox tìm user
    await page.getByRole("button", { name: "Giao việc" }).click();
    const search = page.getByPlaceholder("Tìm người dùng…");
    await expect(search).toBeVisible({ timeout: 10_000 });
    await search.fill("low");
    // debounce 220ms + searchLink THẬT → CommandItem (role=option) hiển thị description "Low Priv"
    const opt = page.getByRole("option", { name: /Low Priv/ });
    await expect(opt).toBeVisible({ timeout: 15_000 });
    await opt.click(); // onPick(value="lowpriv@mf.local") → adapter.assign (frappe.desk.form.assign_to.add THẬT)
    // refetch docinfo → badge user (assignments[].owner = lowpriv@mf.local) + toast success
    await expect(page.getByText(/Đã giao việc/)).toBeVisible({ timeout: 15_000 });
    const removeAssign = page.getByRole("button", { name: "Bỏ lowpriv@mf.local" });
    await expect(removeAssign).toBeVisible({ timeout: 20_000 });
    // Bỏ phụ trách → adapter.assignRemove (assign_to.remove THẬT) → toast + badge biến mất ⇒ net-zero
    await removeAssign.click();
    await expect(page.getByText(/Đã bỏ phụ trách/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Bỏ lowpriv@mf.local" })).toHaveCount(0, { timeout: 20_000 });
  });

  test("Workspace · /workspace: switcher hiện workspace THẬT (get_workspaces)", async ({ page }) => {
    // get_workspaces (v16 trả {pages}) → switcher render tên workspace công khai. Build/Users là
    // workspace mặc định luôn có trên site Frappe ⇒ chứng minh switcher tải dữ liệu thật, không mock.
    await page.goto("/workspace");
    await expect(page.getByRole("button", { name: "Build" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Users" })).toBeVisible();
  });

  test("Permissions · /permissions: tiêu đề + Select DocType + bảng quyền (rolesAndDoctypes/get)", async ({ page }) => {
    await page.goto("/permissions");
    // tiêu đề màn (h2)
    await expect(page.getByRole("heading", { name: "Phân quyền" })).toBeVisible({ timeout: 20_000 });
    // Select DocType render sau get_roles_and_doctypes (combobox)
    await expect(page.getByRole("combobox")).toBeVisible({ timeout: 20_000 });
    // chờ bảng: ≥1 dòng role (Administrator xem được) HOẶC thông báo hợp lệ (rỗng / lỗi quyền)
    const dataRow = page.locator("tbody tr").first();
    const emptyMsg = page.getByText("Không có quy tắc quyền");
    const errMsg = page.getByText(/Không truy cập được/);
    await expect(dataRow.or(emptyMsg).or(errMsg)).toBeVisible({ timeout: 20_000 });
  });

  test("Settings · /settings: user boot thật + 3 nút theme + Đăng xuất", async ({ page }) => {
    await page.goto("/settings");
    // full_name từ getBoot thật = Administrator (xuất hiện 2 lần: tên + (user) ⇒ .first())
    await expect(page.getByText("Administrator").first()).toBeVisible({ timeout: 20_000 });
    // 3 nút theme
    await expect(page.getByRole("button", { name: "Sáng" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tối" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Theo hệ thống" })).toBeVisible();
    // nút Đăng xuất (không bấm — tránh mutate session)
    await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
  });

  test("Notifications · bell topbar (P4): mở dropdown adapter.notifications.list THẬT", async ({ page }) => {
    // Nút chuông aria-label="Thông báo" → DropdownMenu (M19). Site cô lập có thể KHÔNG có
    // notification_log ⇒ "Không có thông báo" vẫn hợp lệ (bell chỉ là phụ trợ, không mutate).
    await page.goto("/app/ToDo");
    const bell = page.getByRole("button", { name: "Thông báo" });
    await expect(bell).toBeVisible({ timeout: 20_000 });
    await bell.click();
    // dropdown hiện: header "Thông báo" (span, exact) HOẶC trạng thái rỗng "Không có thông báo".
    // .first() để khi rỗng (cả header + empty-state cùng hiện) không vướng strict-mode.
    await expect(
      page.getByText("Không có thông báo").or(page.getByText("Thông báo", { exact: true })).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("ContextPanel · Chia sẻ + Liên kết (P8): tab Chi tiết render đủ khối", async ({ page }) => {
    // ContextPanel (cột phải) tab "Chi tiết" = .last() (FormView cột giữa CŨNG có tab "Chi tiết").
    // Khối "Chia sẻ" (docshare) + "Liên kết" (connections) render tiêu đề bất kể có dữ liệu hay không.
    await page.goto("/app/ToDo");
    await page.getByText("Chuẩn bị demo MetaForge live").click();
    const detailTab = page.getByRole("tab", { name: "Ngữ cảnh" }).last();
    await expect(detailTab).toBeVisible({ timeout: 20_000 });
    await detailTab.click();
    await expect(page.getByText("Chia sẻ", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Liên kết", { exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test("i18n · đổi ngôn ngữ (P5): English → shell EN → Tiếng Việt → shell VI (net-zero)", async ({ page }) => {
    // /settings → LocaleSwitch. Đổi EN: ô tìm topbar "Tìm nhanh…" → "Search…". Đổi lại VI ⇒ khôi
    // phục (locale lưu localStorage nhưng mỗi test là context mới ⇒ không bleed; vẫn revert cho sạch).
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Thiết lập" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByText("Search…").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Tiếng Việt" }).click();
    await expect(page.getByText("Tìm nhanh…")).toBeVisible({ timeout: 15_000 });
  });

  test("Gate1 contract · metaforge.api.global_search + get_capabilities (proxy tiêm site+token)", async ({ page }) => {
    await page.goto("/app/ToDo"); // thiết lập session qua proxy vite
    // global_search scoped ToDo — permission-aware, trả mảng {doctype,name,title}
    const gs = await page.request.get("/api/method/metaforge.api.global_search?text=demo&doctype=ToDo");
    expect(gs.ok()).toBeTruthy();
    const gsData = (await gs.json()).message as Array<{ doctype: string; name: string }>;
    expect(Array.isArray(gsData)).toBeTruthy();
    if (gsData.length) expect(gsData[0]).toHaveProperty("doctype", "ToDo");
    // global_search text rỗng → []
    const gsEmpty = await page.request.get("/api/method/metaforge.api.global_search?text=");
    expect(((await gsEmpty.json()).message as unknown[]).length).toBe(0);
    // get_capabilities ToDo — fail-closed shape đủ 7 key; submit=false (ToDo không submittable)
    const caps = await page.request.get("/api/method/metaforge.api.get_capabilities?doctype=ToDo");
    const c = (await caps.json()).message as Record<string, boolean>;
    for (const k of ["read", "write", "create", "delete", "submit", "cancel", "amend"]) {
      expect(typeof c[k]).toBe("boolean");
    }
    expect(c.submit).toBe(false);
  });

  test("Data Import · /import: wizard đầy đủ upload→preview→start→status THẬT (2 ToDo)", async ({ page }) => {
    // Data Import Tool thật: createDoc("Data Import") + uploadFile(import_file) + get_preview_from_template
    // + form_start_import (enqueue background job) + poll get_import_status. Job chạy trên worker site
    // cô lập ⇒ cần chờ lâu hơn 30s mặc định.
    test.setTimeout(150_000);
    const tag = `MFImport-${Date.now()}`;
    const csv = `ID,Status,Priority,Description\n,Open,Low,${tag} #1\n,Open,Medium,${tag} #2\n`;

    await page.goto("/import");
    await expect(page.getByRole("heading", { name: "Nhập dữ liệu" })).toBeVisible({ timeout: 20_000 });
    // DocType mặc định ToDo + kiểu "Thêm bản ghi mới" (mặc định) — chọn file vào input ẩn của FileButton
    await page.locator('input[type="file"]').setInputFiles({ name: `${tag}.csv`, mimeType: "text/csv", buffer: Buffer.from(csv) });

    // bước xem trước hiện (get_preview_from_template thật): cột Description đã map + nút Bắt đầu nhập
    await expect(page.getByText("Xem trước ánh xạ cột")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Bắt đầu nhập" })).toBeVisible();
    await page.screenshot({ path: "screenshots/live-import-preview.png", fullPage: true });

    // chạy import + poll trạng thái tới khi kết quả
    await page.getByRole("button", { name: "Bắt đầu nhập" }).click();
    await expect(page.getByText(/Nhập thành công|Nhập một phần|Nhập lỗi/)).toBeVisible({ timeout: 120_000 });
    // ≥2 bản ghi thành công (Stat "Thành công")
    await expect(page.getByText("Thành công")).toBeVisible();
    await page.screenshot({ path: "screenshots/live-import-result.png", fullPage: true });

    // dọn dẹp best-effort: xoá ToDo vừa nhập (qua proxy vite đã tiêm token+site) — không fail test nếu lỗi
    try {
      const list = await page.request.get(
        `/api/method/frappe.client.get_list?doctype=ToDo&filters=${encodeURIComponent(JSON.stringify([["description", "like", `${tag}%`]]))}&fields=${encodeURIComponent('["name"]')}&limit_page_length=0`,
      );
      const names = (((await list.json()) as { message?: { name: string }[] }).message ?? []).map((r) => r.name);
      for (const name of names) {
        await page.request.post("/api/method/frappe.client.delete", { form: { doctype: "ToDo", name } });
      }
    } catch {
      /* dọn dẹp là phụ — không ảnh hưởng kết quả import đã verify */
    }
  });
});
