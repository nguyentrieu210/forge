import { test, expect } from "@playwright/test";

/**
 * App-mode /x/receive (ReceiveExperience) — LIVE E2E. Trước bản sửa APPMODE-ACTIONS-01 (review độc
 * lập, checkpoint 453d322), phần này CHỈ có changelog + screenshot, không có test commit — reviewer
 * bắt đúng gap. File này lấp gap đó: kiểm THẬT qua browser (không phải suy diễn network).
 *
 * webServer (playwright.live.config.ts) tiêm Administrator token qua vite proxy (`VITE_FRAPPE_TOKEN`)
 * — MỌI request tới `/api` đều auth sẵn AS Administrator (không qua LoginScreen thật). Vì vậy test này
 * dùng chính đặc điểm đó để kiểm bất biến "issued_by ≠ received_by" MỘT CÁCH TỰ ĐỘNG, KHÔNG cần user
 * thứ 2: phiếu do CHÍNH session hiện tại (Administrator) GIAO ra → cùng session đó KHÔNG được NHẬN lại
 * (nút phải tắt + hiện đúng lý do). Chiều "user KHÁC issued_by → được NHẬN" đã live-verify riêng qua
 * browser thật trên `/wms` công khai với user hạn chế `wms.demo@aphvh.local` (xem TEST_REPORT.md V2-2)
 * — không lặp lại ở đây vì cơ chế token-proxy của config này không mô phỏng được 2 identity thật.
 *
 * Fixture Warehouse Transfer DÙNG-MỘT-LẦN (app aphvh, ngoài repo MetaForge) — tạo bằng MF_TOKEN
 * (Administrator, CHỈ để dựng/xoá fixture), dọn ở afterAll (best-effort).
 */

const ADMIN_BACKEND = process.env.VITE_FRAPPE_BACKEND || "http://localhost:8000";
const ADMIN_TOKEN = process.env.VITE_FRAPPE_TOKEN;
const SITE = process.env.VITE_FRAPPE_SITE || "metaforge.localhost";
if (!ADMIN_TOKEN) {
  throw new Error("VITE_FRAPPE_TOKEN required (Administrator) — dựng/xoá fixture Warehouse Transfer.");
}

interface AdminCallResult { status: number; json: any }
async function adminCall(method: string, body?: Record<string, unknown>): Promise<AdminCallResult> {
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

const STAMP = Date.now();
let transferName: string | undefined;
let issueStockEntry: string | undefined;

test.describe.serial("App-mode /x/receive — descriptor server-authoritative (LIVE, APPMODE-ACTIONS-01)", () => {
  test.beforeAll(async () => {
    // SP-002 (has_batch_no=0) — tránh yêu cầu chọn lô, giữ fixture gọn.
    const ins = await adminCall("frappe.client.insert", {
      doc: {
        doctype: "Warehouse Transfer",
        company: "APH",
        source_warehouse: "Nhận hàng APH - APH",
        transit_warehouse: "Trung chuyển APH - APH",
        target_warehouse: "Lưu trữ A APH - APH",
        items: [{ item_code: "SP-002", qty_issued: 1, uom: "Cái" }],
      },
    });
    expect(ins.status, `create Warehouse Transfer fixture: ${JSON.stringify(ins.json)}`).toBe(200);
    transferName = ins.json?.message?.name;
  });

  test.afterAll(async () => {
    if (issueStockEntry) await adminCall("frappe.client.cancel", { doctype: "Stock Entry", name: issueStockEntry }).catch(() => {});
    if (transferName) await adminCall("frappe.client.delete", { doctype: "Warehouse Transfer", name: transferName }).catch(() => {});
    if (issueStockEntry) await adminCall("frappe.client.delete", { doctype: "Stock Entry", name: issueStockEntry }).catch(() => {});
  });

  test("Draft: GIAO HÀNG bật đúng (can_issue=true) → click → In Transit thật (Stock Entry thật)", async ({ page }) => {
    await page.goto(`/x/receive`);
    await page.getByText(transferName!, { exact: false }).first().click();
    await expect(page.getByRole("button", { name: /GIAO HÀNG/i })).toBeEnabled({ timeout: 15_000 });

    const issuePromise = page.waitForResponse(
      (r) => /aphvh\.api\.wms\.transfer_issue/.test(r.url()) && r.request().method() === "POST",
      { timeout: 20_000 },
    );
    await page.getByRole("button", { name: /GIAO HÀNG/i }).click();
    const issueResp = await issuePromise;
    expect(issueResp.status(), "transfer_issue THẬT phải 200").toBe(200);
    const issueBody = await issueResp.json();
    issueStockEntry = issueBody?.message?.stock_entry;
    expect(issueBody?.message?.status).toBe("In Transit");

    await expect(page.getByText(/Đang chuyển/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("In Transit (issued_by=CHÍNH session hiện tại) → NHẬN HÀNG tắt + đúng lý do (can_receive=false)", async ({ page }) => {
    await page.goto(`/x/receive`);
    await page.getByText(transferName!, { exact: false }).first().click();

    // fetch descriptor xong (network idle-ish) rồi mới assert — tránh đọc DOM lúc actions còn null.
    await expect(page.getByText(/Đang chuyển/i).first()).toBeVisible({ timeout: 15_000 });
    const receiveBtn = page.getByRole("button", { name: /NHẬN HÀNG/i });
    await expect(receiveBtn).toBeVisible({ timeout: 15_000 });
    await expect(receiveBtn).toBeDisabled({ timeout: 15_000 });
    await expect(page.getByText(/người nhận phải khác người giao/i)).toBeVisible();
  });
});
