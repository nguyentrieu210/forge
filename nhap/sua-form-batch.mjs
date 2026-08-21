/**
 * GỠ `viewPolicy` mà tôi lỡ tạo cho Batch.
 *
 * Batch vốn KHÔNG có viewPolicy — nghĩa là form vẽ mọi ô. Script thêm ô đã `??=` một
 * `viewPolicy.form` rỗng rồi nhét 4 ô mới vào, biến nó thành danh sách trắng chỉ có 4 ô,
 * che mất Batch ID · Mặt hàng · ngày sản xuất · hạn dùng. Trả về đúng trạng thái cũ.
 *
 * Runtime PHẢI TẮT.  CHẠY:  node nhap/sua-form-batch.mjs [--that]
 */
import { DatabaseSync } from "node:sqlite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const GOC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const D1 = resolve(GOC, "server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite");
const THAT = process.argv.includes("--that");
const db = new DatabaseSync(D1);
const r = db.prepare("SELECT metadata_json, revision FROM doctype_definitions WHERE tenant_id=? AND doctype=?").get("demo", "Batch");
const m = JSON.parse(r.metadata_json);
const ds = m.viewPolicy?.form?.fields ?? [];
console.log(`Batch: form đang là danh sách trắng ${ds.length} ô → ${ds.join(", ")}`);
const chiCoMoi = ds.length > 0 && ds.every((f) => ["color", "condition", "length_m", "is_offcut"].includes(f));
if (!chiCoMoi) { console.log("không phải danh sách do tôi tạo — KHÔNG đụng."); db.close(); process.exit(0); }
delete m.viewPolicy;
console.log(`sẽ gỡ viewPolicy → form vẽ lại đủ ${m.fields.length} ô`);
if (THAT) {
  db.prepare("UPDATE doctype_definitions SET metadata_json=?, revision=? WHERE tenant_id=? AND doctype=?")
    .run(JSON.stringify(m), Number(r.revision ?? 0) + 1, "demo", "Batch");
  console.log("✓ đã gỡ");
} else console.log("(chạy thử — thêm --that để ghi)");
db.close();
