/**
 * smoke — gọi Frappe THẬT qua FrappeAdapterImpl, kiểm chứng chuỗi P0:
 *   (login/token) → getBoot → getWorkspaces → getWorkspace → getMeta → getList → getDoc
 *
 * Chạy:  FRAPPE_SITE_URL=... FRAPPE_TOKEN=api_key:api_secret \
 *        pnpm --filter @metaforge/demo run smoke
 * hoặc:  FRAPPE_SITE_URL=... FRAPPE_USER=... FRAPPE_PWD=... pnpm ... run smoke
 *
 * ⚠️ CHỈ trỏ vào SITE CÔ LẬP (demo). TUYỆT ĐỐI KHÔNG chạy vào erp.kairo.vn / ongxanh.kairo.vn.
 * Toàn bộ thao tác ở đây là READ-ONLY (không tạo/sửa/xoá).
 */
import { FrappeAdapterImpl } from "@metaforge/adapter-frappe";

const url = process.env.FRAPPE_SITE_URL;
const token = process.env.FRAPPE_TOKEN; // "api_key:api_secret"
const user = process.env.FRAPPE_USER;
const pwd = process.env.FRAPPE_PWD;
const siteHeader = process.env.FRAPPE_SITE_HEADER; // vd metaforge.localhost (site sau nginx hardcode)

const BLOCKED = ["erp.kairo.vn", "ongxanh.kairo.vn"];

async function main() {
  if (!url) {
    console.error(
      "✗ Thiếu FRAPPE_SITE_URL. Đặt URL SITE CÔ LẬP (demo) + FRAPPE_TOKEN hoặc FRAPPE_USER/FRAPPE_PWD.\n" +
        "  Smoke test bị bỏ qua (không có site để gọi). Đây KHÔNG phải lỗi build.",
    );
    process.exit(2);
  }
  if (BLOCKED.some((h) => url.includes(h))) {
    console.error(`✗ TỪ CHỐI: ${url} là site khách hàng LIVE. Chỉ chạy trên site demo cô lập.`);
    process.exit(3);
  }

  const headers = siteHeader ? { "X-Frappe-Site-Name": siteHeader } : undefined;
  const adapter = new FrappeAdapterImpl(
    token ? { url, headers, token: { value: () => token, type: "token" } } : { url, headers },
  );

  const dt = process.env.SMOKE_DOCTYPE ?? "ToDo";
  console.log(`smoke → ${url} (doctype thử: ${dt})`);

  if (!token) {
    if (!user || !pwd) throw new Error("Cần FRAPPE_TOKEN, hoặc FRAPPE_USER + FRAPPE_PWD");
    await adapter.login(user, pwd);
    console.log("  ✓ login");
  } else {
    console.log("  ✓ token auth (headless)");
  }

  const boot = await adapter.getBoot();
  console.log(`  ✓ getBoot: user=${boot.user} full_name=${boot.full_name} roles=${boot.roles.length} ws=${boot.allowed_workspaces.length}`);

  const spaces = await adapter.getWorkspaces();
  console.log(`  ✓ getWorkspaces: ${spaces.length} page`);
  if (spaces[0]) {
    const page = await adapter.getWorkspace({ name: spaces[0].name, title: spaces[0].label, public: spaces[0].public });
    console.log(`  ✓ getWorkspace(${spaces[0].name}): shortcuts=${page.shortcuts.length} charts=${page.charts.length} cards=${page.cards.length}`);
  }

  const meta = await adapter.getMeta(dt);
  console.log(`  ✓ getMeta(${dt}): ${meta.fields.length} field, ${meta.permissions.length} perm, masked=${(meta.masked_fields ?? []).length}`);

  const list = await adapter.getList(dt, { fields: ["name"], pageLength: 3 });
  console.log(`  ✓ getList(${dt}): ${list.length} bản ghi`);

  if (list[0]?.name) {
    const { doc, docinfo } = await adapter.getDoc(dt, String(list[0].name));
    console.log(`  ✓ getDoc(${dt}/${doc.name}): docinfo.comments=${docinfo.comments.length}`);
  } else {
    console.log("  · getDoc: bỏ qua (không có bản ghi)");
  }

  console.log("\nsmoke OK — chuỗi adapter→Frappe chạy end-to-end.");
}

main().catch((e) => {
  console.error("✗ smoke FAIL:", e?.message ?? e, e?.exc_type ? `(exc_type=${e.exc_type})` : "");
  process.exit(1);
});
