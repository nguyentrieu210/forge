/**
 * TẮT tab "Nhập hàng loạt" của Item — chủ dự án không dùng.
 *
 * Tab này do `viewPolicy.mobile.bulk.enabled` bật lên (`DoctypeWorkspace.tsx` đọc qua
 * `resolveBulkRenderPolicy`). Tắt bằng CẤU HÌNH chứ không xoá component: `BulkGridContainer` là
 * code dùng chung cho mọi app trên nền tảng — xoá nó ở đây là lấy mất tính năng của app khác vì
 * một doctype không cần.
 *
 * Runtime PHẢI TẮT khi chạy.
 */

import { DatabaseSync } from "node:sqlite";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const GOC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const D1 = process.env.ALUMDOOR_D1_PATH || resolve(GOC, "server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite");
const TENANT = "demo";
const DOCTYPE = process.argv[2] ?? "Item";

mkdirSync(resolve(GOC, "nhap/.sao-luu"), { recursive: true });
const sao = resolve(GOC, "nhap/.sao-luu", `d1-truoc-TAT-BULK-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`);
copyFileSync(D1, sao);

const db = new DatabaseSync(D1);
const row = db.prepare("SELECT metadata_json, revision FROM doctype_definitions WHERE tenant_id=? AND doctype=?").get(TENANT, DOCTYPE);
if (!row) throw new Error(`Không thấy doctype ${DOCTYPE}`);
const m = JSON.parse(row.metadata_json);

const truoc = m.viewPolicy?.mobile?.bulk?.enabled;
if (m.viewPolicy?.mobile?.bulk) m.viewPolicy.mobile.bulk.enabled = false;

m.revision = (m.revision ?? row.revision ?? 1) + 1;
db.prepare("UPDATE doctype_definitions SET metadata_json=?, revision=?, modified_at=?, modified_by=? WHERE tenant_id=? AND doctype=?")
  .run(JSON.stringify(m), m.revision, new Date().toISOString(), "tat-nhap-hang-loat", TENANT, DOCTYPE);
db.close();

console.log(`${DOCTYPE}: nhập hàng loạt ${truoc} → ${m.viewPolicy?.mobile?.bulk?.enabled}`);
console.log(`revision → ${m.revision}`);
console.log(`sao lưu: ${sao}`);
