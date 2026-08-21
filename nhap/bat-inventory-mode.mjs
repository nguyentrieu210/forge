/**
 * BẬT `inventory_mode` — công tắc đánh thức toàn bộ luật nhôm.
 *
 * Ô này khai `fetch_from: measurement_profile.inventory_mode`, nhưng kernel KHÔNG BAO GIỜ tự
 * tính `fetch_from` — chỉ client tính, khi có người mở form chọn tay. 296 mã nhập qua API nên
 * ô này rỗng sạch, và mọi luật nhôm ngủ suốt từ đầu tới giờ.
 *
 * ĐÂY LÀ BƯỚC KHÓ LÙI NHẤT. Bật lên là `aluminumItemContract` bắt đầu chạy mỗi lần lưu Item;
 * mã nào không thoả hợp đồng sẽ KHÔNG LƯU ĐƯỢC NỮA. Nên script MÔ PHỎNG hợp đồng cho từng mã
 * trước, và TỪ CHỐI GHI nếu còn mã nào trượt — thà không bật còn hơn bật rồi khoá chết danh mục.
 *
 * Cũng đặt luôn 3 ô chỉ-đọc mà hợp đồng đòi (`purchase_stock_qty_field`,
 * `purchase_allocation_qty_field`, `purchase_allocation_uom`) — API từ chối ghi ô chỉ đọc nên
 * chúng chỉ đặt được ở đây.
 *
 * Runtime PHẢI TẮT.  CHẠY:  node nhap/bat-inventory-mode.mjs [--that]
 */

import { DatabaseSync } from "node:sqlite";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const GOC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const D1 = process.env.ALUMDOOR_D1_PATH || resolve(GOC, "server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite");
const TENANT = "demo";
const THAT = process.argv.includes("--that");

const db = new DatabaseSync(D1);
const bo = new Map(db.prepare("SELECT name, payload_json FROM documents WHERE tenant_id=? AND doctype=?").all(TENANT, "Measurement Profile")
  .map((r) => [r.name, JSON.parse(r.payload_json)]));
const items = db.prepare("SELECT name, payload_json FROM documents WHERE tenant_id=? AND doctype=?").all(TENANT, "Item")
  .map((r) => ({ name: r.name, p: JSON.parse(r.payload_json) }));

const DEM = new Set(["cây", "lá", "đoạn"]);
const chuan = (v) => String(v ?? "").normalize("NFC").trim().toLocaleLowerCase("vi");
const bat = (v) => v === true || v === 1 || v === "1";

/** Bản sao TRUNG THÀNH của `aluminumItemContract` — sai lệch ở đây là bật nhầm rồi mới biết. */
function hopDong(p, che) {
  const loi = [];
  if (che !== "Nhôm cây/lá") return loi;                    // chế độ khác không bị hợp đồng này soi
  if (!DEM.has(chuan(p.stock_uom))) loi.push(`stock_uom phải Cây/Lá/Đoạn (đang ${p.stock_uom})`);
  if (chuan(p.default_purchase_uom) !== "kg") loi.push(`ĐVT mua phải Kg (đang ${p.default_purchase_uom})`);
  if (!bat(p.has_batch_no)) loi.push("chưa bật Theo dõi theo lô");
  if (!bat(p.has_catch_weight)) loi.push("chưa bật Cân thực tế");
  if (chuan(p.weight_uom) !== "kg") loi.push(`ĐVT khối lượng phải Kg (đang ${p.weight_uom ?? "trống"})`);
  if (bat(p.allow_negative_stock)) loi.push("Cho phép tồn âm phải tắt");
  if ((p.uom_conversions ?? []).some((c) => chuan(c?.uom) === "kg")) loi.push("còn dòng quy đổi Kg tĩnh");
  return loi;
}

const ke = [];
for (const { name, p } of items) {
  const che = bo.get(p.measurement_profile)?.inventory_mode;
  if (!che) { ke.push({ name, che: null, loi: [`bộ theo dõi "${p.measurement_profile ?? "(trống)"}" không có kiểu quản lý tồn`] }); continue; }
  ke.push({ name, che, p, loi: hopDong(p, che) });
}

const theoChe = {};
for (const k of ke) theoChe[k.che ?? "(không xác định)"] = (theoChe[k.che ?? "(không xác định)"] ?? 0) + 1;
console.log(`${THAT ? "GHI THẬT" : "chạy thử (thêm --that để ghi)"} · ${items.length} mã\n`);
console.log("sẽ đặt kiểu quản lý tồn:");
for (const [k, v] of Object.entries(theoChe).sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(4)}  ${k}`);

const truot = ke.filter((k) => k.loi.length);
console.log(`\nmã KHÔNG thoả hợp đồng: ${truot.length}`);
for (const t of truot.slice(0, 25)) console.log(`   ✗ ${t.name.padEnd(26)} ${t.loi.join(" · ")}`);
if (truot.length > 25) console.log(`   … và ${truot.length - 25} mã nữa`);

if (truot.length) {
  console.log("\nDỪNG — không ghi. Bật lên là những mã trên khoá chết, sửa xong hết rồi chạy lại.");
  db.close(); process.exit(1);
}
if (!THAT) { console.log("\nmọi mã đều thoả hợp đồng — thêm --that để ghi"); db.close(); process.exit(0); }

mkdirSync(resolve(GOC, "nhap/.sao-luu"), { recursive: true });
copyFileSync(D1, resolve(GOC, "nhap/.sao-luu", `d1-truoc-BAT-INVENTORY-MODE-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`));

let n = 0;
for (const k of ke) {
  const p = { ...k.p, inventory_mode: k.che };
  if (k.che === "Nhôm cây/lá") {
    p.purchase_stock_qty_field = "qty_bar";
    p.purchase_allocation_qty_field = "qty_bar";
    p.purchase_allocation_uom = p.stock_uom;
  }
  db.prepare("UPDATE documents SET payload_json=? WHERE tenant_id=? AND doctype=? AND name=?").run(JSON.stringify(p), TENANT, "Item", k.name);
  n += 1;
}
db.close();
console.log(`\nđã đặt kiểu quản lý tồn cho ${n} mã · bật lại runtime`);
